import crypto from 'node:crypto';
import { JankyIndex } from '../src/lib/janky-index.js';

function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length/2))
    .toString('hex') // convert to hexadecimal format
    .slice(0,length);   // return required number of characters
}

describe('Filter tests', function() {
  it('works', function() {
    const index = new JankyIndex(['protocol', 'schema', 'author', 'contextId']);

    const subscriptions = [
      { subscriptionId : generateRandomString(10),
        filter         : { protocol: 'yeeter' }
      },
      {
        subscriptionId : generateRandomString(10),
        filter         : { protocol: 'yeeter', schema: 'yeeter/post' }
      },
      {
        subscriptionId : generateRandomString(10),
        filter         : { protocol: 'yeeter', schema: 'yeeter/post', contextId: 'abcd123' }
      },
      {
        subscriptionId : generateRandomString(10),
        filter         : { protocol: 'yeeter', author: 'moe' }
      }
    ];

    for (let sub of subscriptions) {
      index.put(sub.filter, sub);
    }

    const message = {
      recordId   : 'bafyreic3tk2cwdsr6mn6grlguzj74wy4qpk6f6oahekzhj4tu7s3g73dqm',
      contextId  : 'bafyreic3tk2cwdsr6mn6grlguzj74wy4qpk6f6oahekzhj4tu7s3g73dqm',
      descriptor : {
        method        : 'RecordsWrite',
        schema        : 'yeeter/post',
        dataCid       : 'bafybeihoe4ujck47ygyihqwpe6uaegl4ysjy5lu5zcdraylauukgek4ngu',
        protocol      : 'yeeter',
        published     : true,
        dataFormat    : 'application/json',
        dateCreated   : '2023-01-31T19:47:19.863439',
        dateModified  : '2023-01-31T19:47:19.863439',
        datePublished : '2023-01-31T19:47:19.863439'
      },
    };

    const filter = {
      contextId : 'bafyreic3tk2cwdsr6mn6grlguzj74wy4qpk6f6oahekzhj4tu7s3g73dqm',
      schema    : 'yeeter/post',
      protocol  : 'yeeter',
    };

    const result = index.query(filter, (result) => {
      const numFilterKeys = Object.keys(result.document.filter).length;

      return numFilterKeys === result.score;
    });

    console.log(JSON.stringify(result, null, 4));
  });
});