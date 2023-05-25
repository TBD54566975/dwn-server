# DWN Server Helm Chart

This is a Helm chart for deploying a DWN Server

## Chart Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Number of replicas |
| `fullnameOverride` | string | `""` | Override the fullname of the resources |
| `image.repository` | string | `"ghcr.io/tbd54566975/dwn-server"` | Image repository |
| `image.tag` | string | `"main"` | Image tag |
| `image.pullPolicy` | string | `"IfNotPresent"` | Image pull policy |
| `service.type` | string | `"ClusterIP"` | Service type |
| `service.port` | int | `80` | Service port |
| `service.targetPort` | int | `3000` | Service target port |
| `ingress.enabled` | bool | `false` | Enable ingress |
| `ingress.annotations` | object | `{"kubernetes.io/ingress.class": "nginx"}` | Ingress annotations |
| `ingress.hosts` | list | `[{"host":"dwn.example.com","paths":[{"path":"/","pathType":"Prefix"}]}]` | Ingress hostnames and paths |
| `persistence.size` | string | `"1Gi"` | Size of persistent volume claim |
| `persistence.storageClass` | string | `"standard"` | Type of storage class |
| `resources.requests.cpu` | string | `"100m"` | CPU resource request |
| `resources.requests.memory` | string | `"500Mi"` | Memory resource request |
| `customLabels` | object | `{}` | Custom labels to add to the deployed objects |
| `env.DS_PORT` | int | `3000` | Port that the server listens on |
| `env.DS_MAX_RECORD_DATA_SIZE` | string | `"1gb"` | Maximum size for RecordsWrite data |
| `env.DS_WEBSOCKET_SERVER` | string | `"on"` | Whether to enable listening over ws |
