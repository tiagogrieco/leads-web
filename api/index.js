import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";

const PORT = Number(process.env.PORT || 3000);
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
    console.error("DATABASE_URL nao definido");
    process.exit(1);
}

const pool = new pg.Pool({
    connectionString: DB_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function buildWhere(q) {
    const where = [];
    const params = [];
    const push = (val) => { params.push(val); return `$${params.length}`; };

    if (q.uf) where.push(`e.uf = ${push(String(q.uf).toUpperCase())}`);
    if (q.municipio_cod) where.push(`e.municipio_cod = ${push(String(q.municipio_cod))}`);
    if (q.cnae_prefix) {
        // BETWEEN usa indice B-tree padrao + e mais rapido que LIKE
        const lo = push(q.cnae_prefix);
        const hi = push(q.cnae_prefix + "￿");
        where.push(`e.cnae_principal >= ${lo} AND e.cnae_principal < ${hi}`);
    }
    if (q.cnae) where.push(`e.cnae_principal = ${push(String(q.cnae))}`);
    where.push(`e.situacao = ${push(q.situacao || "02")}`);
    if (q.porte) {
        const portes = String(q.porte).split(",").filter(Boolean);
        if (portes.length) where.push(`emp.porte = ANY(${push(portes)})`);
    }
    if (q.has_email === "true") where.push("e.email <> ''");
    if (q.has_phone === "true") where.push("(e.tel_1 <> '' OR e.tel_2 <> '')");
    if (q.q) {
        const p = push(`%${q.q}%`);
        where.push(`(emp.razao_social ILIKE ${p} OR e.nome_fantasia ILIKE ${p})`);
    }

    return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

const SELECT_COLS = `
  e.cnpj_basico || e.cnpj_ordem || e.cnpj_dv AS cnpj,
  emp.razao_social,
  e.nome_fantasia,
  emp.porte,
  emp.capital_social,
  e.cnae_principal AS cnae_codigo,
  c.descricao AS cnae_descricao,
  CASE WHEN e.ddd_1 <> '' THEN '(' || e.ddd_1 || ') ' || e.tel_1 ELSE '' END AS telefone,
  e.email,
  TRIM(e.tipo_logradouro || ' ' || e.logradouro) AS logradouro,
  e.numero,
  e.complemento,
  e.bairro,
  m.descricao AS municipio,
  e.uf,
  e.cep,
  e.data_inicio_atv AS data_abertura
`;

const FROM_JOIN = `
  FROM rf.estabelecimentos e
  LEFT JOIN rf.empresas    emp ON emp.cnpj_basico = e.cnpj_basico
  LEFT JOIN rf.cnaes       c   ON c.codigo = e.cnae_principal
  LEFT JOIN rf.municipios  m   ON m.codigo = e.municipio_cod
`;

// ---------------------------------------------------------------------------
// rotas
// ---------------------------------------------------------------------------
app.get("/health", async () => {
    const r = await pool.query("SELECT COUNT(*)::int AS n FROM rf.estabelecimentos");
    return { ok: true, estabelecimentos: r.rows[0].n };
});

app.get("/search", async (req) => {
    const q = req.query;
    const page = Math.max(1, Number(q.page || 1));
    const per = Math.min(200, Math.max(1, Number(q.per || 50)));
    const { sql: where, params } = buildWhere(q);

    // COUNT sem JOIN - apenas tabela estabelecimentos (filtros sao todos nela)
    // Filtros que dependem de empresas (porte) sao raros; deixa pra outro endpoint
    const usesEmpresas = where.includes("emp.");
    const countSql = usesEmpresas
        ? `SELECT COUNT(*)::int AS total ${FROM_JOIN} ${where}`
        : `SELECT COUNT(*)::int AS total FROM rf.estabelecimentos e ${where}`;
    const countRes = await pool.query(countSql, params);
    const total = countRes.rows[0].total;

    const dataSql = `
        SELECT ${SELECT_COLS}
        ${FROM_JOIN}
        ${where}
        ORDER BY e.cnpj_basico
        LIMIT ${per} OFFSET ${(page - 1) * per}
    `;
    const dataRes = await pool.query(dataSql, params);
    return { total, page, per, rows: dataRes.rows };
});

app.get("/export.csv", async (req, reply) => {
    const q = req.query;
    const { sql: where, params } = buildWhere(q);
    const maxRows = Math.min(100_000, Number(q.max || 50_000));

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="leads.csv"`);

    const cols = ["cnpj", "razao_social", "nome_fantasia", "porte", "capital_social",
        "cnae_codigo", "cnae_descricao", "telefone", "email", "logradouro",
        "numero", "complemento", "bairro", "municipio", "uf", "cep", "data_abertura"];

    reply.raw.write("﻿"); // BOM UTF-8 pra Excel BR
    reply.raw.write(cols.join(";") + "\n");

    const sql = `
        SELECT ${SELECT_COLS}
        ${FROM_JOIN}
        ${where}
        LIMIT ${maxRows}
    `;
    const res = await pool.query(sql, params);
    for (const r of res.rows) {
        const line = cols.map(c => {
            const v = r[c] == null ? "" : String(r[c]).replace(/"/g, '""').replace(/\n/g, " ");
            return v.includes(";") || v.includes('"') ? `"${v}"` : v;
        }).join(";");
        reply.raw.write(line + "\n");
    }
    reply.raw.end();
});

app.get("/lookups/cnaes", async (req) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    if (!q) return { rows: [] };
    const r = await pool.query(
        `SELECT codigo, descricao FROM rf.cnaes
         WHERE descricao ILIKE $1 OR codigo LIKE $2
         ORDER BY codigo LIMIT $3`,
        [`%${q}%`, `${q}%`, limit]
    );
    return { rows: r.rows };
});

app.get("/lookups/municipios", async (req) => {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    if (!q) return { rows: [] };
    const r = await pool.query(
        `SELECT codigo, descricao FROM rf.municipios
         WHERE descricao ILIKE $1 ORDER BY descricao LIMIT $2`,
        [`%${q.toUpperCase()}%`, limit]
    );
    return { rows: r.rows };
});

app.get("/lookups/stats", async () => {
    const r = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM rf.estabelecimentos) AS estabelecimentos,
          (SELECT COUNT(*)::int FROM rf.empresas) AS empresas,
          (SELECT COUNT(DISTINCT uf) FROM rf.estabelecimentos) AS ufs,
          (SELECT COUNT(*)::int FROM rf.cnaes) AS cnaes
    `);
    return r.rows[0];
});

// ---------------------------------------------------------------------------
app.listen({ host: "0.0.0.0", port: PORT })
    .then(() => console.log(`leads-api on :${PORT}`))
    .catch((e) => { console.error(e); process.exit(1); });
