import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import type { Express } from 'express';
import type { Dialect } from 'kysely';
import { Kysely } from 'kysely';

const recentChallenges: { [challenge: string]: number } = {};
const CHALLENGE_TIMEOUT = 5 * 60 * 1000; // challenges are valid this long after issuance
const COMPLEXITY_LOOKBACK = 5 * 60 * 1000; // complexity is based on number of successful registrations in this timeframe
const COMPLEXITY_MINIMUM = 5;

export class TenantGate {
  #db: Kysely<TenantRegistrationDatabase>;
  #powRequired: boolean;
  #tosRequired: boolean;
  #tos?: string;
  #tosHash?: string;
  #logRejections: boolean;

  constructor(
    dialect: Dialect,
    powRequired: boolean,
    tosRequired: boolean,
    currentTOS?: string,
    logRejections?: boolean,
  ) {
    this.#db = new Kysely<TenantRegistrationDatabase>({ dialect: dialect });
    this.#powRequired = powRequired;
    this.#tosRequired = tosRequired;
    if (tosRequired) {
      this.#tos = currentTOS;
      const tosHash = createHash('sha256');
      tosHash.update(currentTOS);
      this.#tosHash = tosHash.digest('hex');
    }
    this.#logRejections = logRejections || false;
  }

  async initialize(): Promise<void> {
    setInterval(() => {
      for (const challenge of Object.keys(recentChallenges)) {
        if (
          recentChallenges[challenge] &&
          Date.now() - recentChallenges[challenge] > CHALLENGE_TIMEOUT
        ) {
          delete recentChallenges[challenge];
        }
      }
    }, CHALLENGE_TIMEOUT / 4);

    await this.#db.schema
      .createTable('authorizedTenants')
      .ifNotExists()
      .addColumn('did', 'text', (column) => column.primaryKey())
      .addColumn('powTime', 'timestamp')
      .addColumn('tos', 'boolean')
      .execute();
  }

  setupRoutes(server: Express): void {
    if (this.#powRequired) {
      server.get('/register/pow', (req: Request, res: Response) =>
        this.getProofOfWorkChallenge(req, res),
      );
      server.post('/register/pow', (req: Request, res: Response) =>
        this.verifyProofOfWorkChallenge(req, res),
      );
    }
    if (this.#tosRequired) {
      server.get('/register/tos', (req: Request, res: Response) =>
        res.send(this.#tos),
      );
      server.post('/register/tos', (req: Request, res: Response) =>
        this.acceptTOS(req, res),
      );
    }
  }

  async isTenant(tenant: string): Promise<boolean> {
    if (!this.#powRequired && !this.#tosRequired) {
      return true;
    }

    const result = await this.#db
      .selectFrom('authorizedTenants')
      .select('powTime')
      .select('tos')
      .where('did', '=', tenant)
      .execute();

    if (result.length == 0) {
      console.log('rejecting tenant that is not in the database', { tenant });
      return false;
    }

    const row = result[0];

    if (this.#powRequired && row.powTime == undefined) {
      console.log('rejecting tenant that has not completed the proof of work', {
        tenant,
      });
      return false;
    }

    if (this.#tosRequired && row.tos != this.#tosHash) {
      console.log(
        'rejecting tenant that has not accepted the current terms of service',
        { row, tenant, expected: this.#tosHash },
      );
      return false;
    }

    return true;
  }

  async authorizeTenantPOW(tenant: string): Promise<void> {
    await this.#db
      .insertInto('authorizedTenants')
      .values({
        did: tenant,
        powTime: Date.now(),
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet((eb) => ({
          powTime: eb.ref('excluded.powTime'),
        })),
      )
      .executeTakeFirst();
  }

  private async getProofOfWorkChallenge(
    _req: Request,
    res: Response,
  ): Promise<void> {
    const challenge = randomBytes(10).toString('base64');
    recentChallenges[challenge] = Date.now();
    res.json({
      challenge: challenge,
      complexity: await this.getComplexity(),
    });
  }

  private async verifyProofOfWorkChallenge(
    req: Request,
    res: Response,
  ): Promise<void> {
    const body: {
      did: string;
      challenge: string;
      response: string;
    } = req.body;

    const challengeIssued = recentChallenges[body.challenge];
    if (
      challengeIssued == undefined ||
      Date.now() - challengeIssued > CHALLENGE_TIMEOUT
    ) {
      res
        .status(401)
        .json({ success: false, reason: 'challenge invalid or expired' });
      return;
    }

    const hash = createHash('sha256');
    hash.update(body.challenge);
    hash.update(body.response);

    const complexity = await this.getComplexity();
    const digest = hash.digest('hex');
    if (!digest.startsWith('0'.repeat(complexity))) {
      res.status(401).json({
        success: false,
        reason: 'insufficiently complex',
        requiredComplexity: complexity,
      });
      return;
    }

    try {
      await this.authorizeTenantPOW(body.did);
    } catch (e) {
      console.log('error inserting did', e);
      res.status(500).json({ success: false });
      return;
    }
    res.json({ success: true });
  }

  private async getComplexity(): Promise<number> {
    const result = await this.#db
      .selectFrom('authorizedTenants')
      .where('powTime', '>', Date.now() - COMPLEXITY_LOOKBACK)
      .select((eb) => eb.fn.countAll().as('recent_reg_count'))
      .executeTakeFirstOrThrow();
    const recent = result.recent_reg_count as number;
    if (recent == 0) {
      return COMPLEXITY_MINIMUM;
    }

    const complexity = Math.floor(recent / 10);
    if (complexity < COMPLEXITY_MINIMUM) {
      return COMPLEXITY_MINIMUM;
    }

    return complexity;
  }

  private async acceptTOS(req: Request, res: Response): Promise<void> {
    const body: {
      did: string;
      tosHash: string;
    } = req.body;

    if (body.tosHash != this.#tosHash) {
      res.status(400).json({
        success: false,
        reason: 'incorrect TOS hash',
      });
    }

    console.log('accepting tos', body);

    await this.#db
      .insertInto('authorizedTenants')
      .values({
        did: body.did,
        tos: body.tosHash,
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet((eb) => ({
          tos: eb.ref('excluded.tos'),
        })),
      )
      .executeTakeFirstOrThrow();
    res.status(200).json({ success: true });
  }

  async authorizeTenantTOS(tenant: string): Promise<void> {
    await this.#db
      .insertInto('authorizedTenants')
      .values({
        did: tenant,
        tos: this.#tosHash,
      })
      .onConflict((oc) =>
        oc.column('did').doUpdateSet((eb) => ({
          tos: eb.ref('excluded.tos'),
        })),
      )
      .executeTakeFirst();
  }
}

interface AuthorizedTenants {
  did: string;
  tos: string;
  powTime: number;
}

interface TenantRegistrationDatabase {
  authorizedTenants: AuthorizedTenants;
}
