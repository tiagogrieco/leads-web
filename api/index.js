import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import ExcelJS from "exceljs";

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
        // Frontend envia "ME"|"EPP"|"DEMAIS"|"NAO INFORMADO"; banco usa codigos 01,03,05,00
        const PORTE_MAP = { "ME": "01", "EPP": "03", "DEMAIS": "05", "NAO INFORMADO": "00" };
        const portes = String(q.porte).split(",").map(p => PORTE_MAP[p] || p).filter(Boolean);
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
  CASE emp.porte WHEN '01' THEN 'ME' WHEN '03' THEN 'EPP' WHEN '05' THEN 'DEMAIS' WHEN '00' THEN 'NAO INFORMADO' ELSE emp.porte END AS porte,
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

app.get("/export.xlsx", async (req, reply) => {
    const q = req.query;
    const { sql: where, params } = buildWhere(q);
    const maxRows = Math.min(50_000, Number(q.max || 50_000));

    const sql = `
        SELECT ${SELECT_COLS}
        ${FROM_JOIN}
        ${where}
        LIMIT ${maxRows}
    `;
    const res = await pool.query(sql, params);

    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: reply.raw,
        useStyles: true,
        useSharedStrings: false,
    });
    const ws = wb.addWorksheet("Leads", {
        views: [{ state: "frozen", ySplit: 1 }],
    });

    const cols = [
        { header: "CNPJ", key: "cnpj", width: 22 },
        { header: "Razão Social", key: "razao_social", width: 38 },
        { header: "Fantasia", key: "nome_fantasia", width: 30 },
        { header: "Porte", key: "porte", width: 10 },
        { header: "Capital Social", key: "capital_social", width: 14 },
        { header: "CNAE", key: "cnae_codigo", width: 10 },
        { header: "Atividade", key: "cnae_descricao", width: 42 },
        { header: "Telefone", key: "telefone", width: 18 },
        { header: "Email", key: "email", width: 30 },
        { header: "Logradouro", key: "logradouro", width: 32 },
        { header: "Número", key: "numero", width: 10 },
        { header: "Complemento", key: "complemento", width: 18 },
        { header: "Bairro", key: "bairro", width: 22 },
        { header: "Município", key: "municipio", width: 22 },
        { header: "UF", key: "uf", width: 5 },
        { header: "CEP", key: "cep", width: 12 },
        { header: "Data Abertura", key: "data_abertura", width: 14 },
    ];
    ws.columns = cols;

    // Estilo header (rose-gold da Seenup)
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB08D7E" } };
    headerRow.alignment = { vertical: "middle", horizontal: "left" };
    headerRow.height = 22;
    headerRow.commit();

    const formatCnpj = (c) => c && c.length === 14
        ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`
        : c;
    const formatCep = (c) => c && c.length === 8 ? `${c.slice(0,5)}-${c.slice(5)}` : c;
    const formatDate = (d) => d && d.length === 8 ? `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}` : d;

    for (const row of res.rows) {
        ws.addRow({
            ...row,
            cnpj: formatCnpj(row.cnpj),
            cep: formatCep(row.cep),
            data_abertura: formatDate(row.data_abertura),
        }).commit();
    }

    // Auto-filter no range completo
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: res.rows.length + 1, column: cols.length } };

    const ts = new Date().toISOString().slice(0, 10);
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="leads_${ts}.xlsx"`);
    await wb.commit();
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
    // Usa reltuples (estimativa) - INSTANTANEO vs COUNT(*) que demora minutos em 68M rows
    const r = await pool.query(`
        SELECT
          (SELECT reltuples::bigint FROM pg_class WHERE oid = 'rf.estabelecimentos'::regclass) AS estabelecimentos,
          (SELECT reltuples::bigint FROM pg_class WHERE oid = 'rf.empresas'::regclass) AS empresas,
          (SELECT COUNT(*)::int FROM rf.cnaes) AS cnaes,
          27 AS ufs
    `);
    return r.rows[0];
});

// ---------------------------------------------------------------------------
app.listen({ host: "0.0.0.0", port: PORT })
    .then(() => console.log(`leads-api on :${PORT}`))
    .catch((e) => { console.error(e); process.exit(1); });
