# DWN Server Helm Chart

This is a Helm chart for deploying a DWN Server

## Quick Start

If you don't have an existing Kubernetes cluster to deploy to, using the built-in Kubernetes included with Docker Desktop is an easy way to get started. See the [Enable Kubernetes](https://docs.docker.com/desktop/kubernetes/) instructions.

Installing this chart requires [having helm installed locally](https://helm.sh/docs/intro/install/)

Once Kubernetes and Helm are ready:

```
git clone https://github.com/TBD54566975/dwn-server.git
cd dwn-server/charts
helm upgrade --install --namespace dwn-server dwn-server .
```

By default, the dwn-server that's deployed is only accessible from with the Kubernetes cluster. An `Ingress` or `VirtualService` are optional and can be installed by this chart. See values.yaml for the options.

To access the dwn-server from within the cluster:

```
kubectl port-forward -n dwn-server service/dwn-server 3000:80
```

You can then, in another terminal window, confirm everything is working by running:

```
curl localhost:3000
```

Which should return the message "please use a web5 client, for example: https://github.com/TBD54566975/web5-js"

## Chart Values

| Key                           | Type   | Default                                                                   | Description                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| `replicaCount`                | int    | `1`                                                                       | Number of replicas                           |
| `fullnameOverride`            | string | `""`                                                                      | Override the fullname of the resources       |
| `image.repository`            | string | `"ghcr.io/tbd54566975/dwn-server"`                                        | Image repository                             |
| `image.tag`                   | string | `"main"`                                                                  | Image tag                                    |
| `image.pullPolicy`            | string | `"IfNotPresent"`                                                          | Image pull policy                            |
| `service.type`                | string | `"ClusterIP"`                                                             | Service type                                 |
| `service.port`                | int    | `80`                                                                      | Service port                                 |
| `service.targetPort`          | int    | `3000`                                                                    | Service target port                          |
| `ingress.enabled`             | bool   | `false`                                                                   | Enable ingress                               |
| `ingress.annotations`         | object | `{"kubernetes.io/ingress.class": "nginx"}`                                | Ingress annotations                          |
| `ingress.hosts`               | list   | `[{"host":"dwn.example.com","paths":[{"path":"/","pathType":"Prefix"}]}]` | Ingress hostnames and paths                  |
| `persistence.size`            | string | `"1Gi"`                                                                   | Size of persistent volume claim              |
| `persistence.storageClass`    | string | `"standard"`                                                              | Type of storage class                        |
| `resources.requests.cpu`      | string | `"100m"`                                                                  | CPU resource request                         |
| `resources.requests.memory`   | string | `"500Mi"`                                                                 | Memory resource request                      |
| `customLabels`                | object | `{}`                                                                      | Custom labels to add to the deployed objects |
| `env.DS_PORT`                 | int    | `3000`                                                                    | Port that the server listens on              |
| `env.DS_MAX_RECORD_DATA_SIZE` | string | `"1gb"`                                                                   | Maximum size for RecordsWrite data           |
| `env.DS_WEBSOCKET_SERVER`     | string | `"on"`                                                                    | Whether to enable listening over ws          |
