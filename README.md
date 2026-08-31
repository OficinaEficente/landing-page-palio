# Landing Page Palio

Landing page de alta conversão para o curso de reparo da caixa de direção do Fiat Palio.

## Stack
- HTML/CSS/JS estático
- Cloudflare Workers
- GitHub Actions para deploy automático

## Deploy
O workflow em `.github/workflows/deploy.yml` publica o Worker sempre que houver push na branch `main`.

### Secrets necessários no GitHub
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Desenvolvimento local
Instale o Wrangler e execute:

```bash
npm install
npm run dev
```
