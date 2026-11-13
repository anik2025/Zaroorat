# KotaMitra Backend

A dependency-free local API foundation using Node.js built-in modules. It is intentionally dependency-free until the database provider is selected.

## Run

From this folder:

```text
node server.js
```

Endpoints:

- `GET /api/health`
- `GET /api/businesses?q=tiffin&area=Talwandi`
- `POST /api/businesses`

Submitted businesses are stored locally at `database/data/businesses.json`. This is for development only; before public launch we will move to a hosted database, add authentication, validation, rate limits, and admin authorization.
