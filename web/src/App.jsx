import { useEffect, useMemo, useState } from "react";

const API = "/api";
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const PORTES = ["DEMAIS","EPP","ME","NAO INFORMADO"];

// Presets de segmento — clica e já filtra
const PRESETS = [
    { id: "salao",        emoji: "💇", label: "Salões de beleza",      cnae: "9602" },
    { id: "estetica",     emoji: "💅", label: "Estética e cuidados",   cnae: "9602502" },
    { id: "petshop",      emoji: "🐾", label: "Pet shops",              cnae: "4789004" },
    { id: "vet",          emoji: "🩺", label: "Clínicas veterinárias",  cnae: "7500" },
    { id: "academia",     emoji: "🏋️", label: "Academias",              cnae: "9313" },
    { id: "supermercado", emoji: "🛒", label: "Super/mini mercados",    cnae: "4711" },
    { id: "mini",         emoji: "🏪", label: "Mercearias / mini",      cnae: "4712" },
    { id: "padaria",      emoji: "🥖", label: "Padarias",               cnae: "472110" },
    { id: "restaurante",  emoji: "🍽️", label: "Restaurantes",           cnae: "5611" },
    { id: "lanchonete",   emoji: "🍔", label: "Lanchonetes",            cnae: "561120" },
    { id: "bar",          emoji: "🍺", label: "Bares",                  cnae: "561120" },
    { id: "farmacia",     emoji: "💊", label: "Farmácias",              cnae: "4771" },
    { id: "posto",        emoji: "⛽", label: "Postos de combustível",  cnae: "4731" },
    { id: "hotel",        emoji: "🏨", label: "Hotéis e pousadas",      cnae: "5510" },
    { id: "roupas",       emoji: "👔", label: "Lojas de roupas",        cnae: "4781" },
    { id: "calcado",      emoji: "👟", label: "Lojas de calçados",      cnae: "4782" },
    { id: "clinica",      emoji: "⚕️",  label: "Clínicas médicas",       cnae: "8630" },
    { id: "odonto",       emoji: "🦷", label: "Clínicas odontológicas", cnae: "863050" },
    { id: "escola",       emoji: "🏫", label: "Escolas",                cnae: "85" },
    { id: "imobiliaria",  emoji: "🏠", label: "Imobiliárias",           cnae: "6810" },
    { id: "construtora",  emoji: "🏗️", label: "Construtoras",           cnae: "412" },
    { id: "transporte",   emoji: "🚚", label: "Transportadoras",        cnae: "4930" },
    { id: "ind-alimento", emoji: "🥫", label: "Indústria alimentícia",  cnae: "10" },
    { id: "ind-bebida",   emoji: "🍷", label: "Indústria de bebidas",   cnae: "11" },
    { id: "ind-farma",    emoji: "💉", label: "Indústria farmacêutica", cnae: "21" },
    { id: "ind-quimica",  emoji: "🧪", label: "Indústria química",      cnae: "20" },
];

export default function App() {
    const [filters, setFilters] = useState({
        uf: "GO", cnae_prefix: "", municipio_cod: "", porte: [], q: "",
        has_phone: false, has_email: false,
    });
    const [page, setPage] = useState(1);
    const [per] = useState(50);
    const [data, setData] = useState({ total: 0, rows: [] });
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);

    const [cnaeQ, setCnaeQ] = useState("");
    const [cnaeRes, setCnaeRes] = useState([]);
    const [munQ, setMunQ] = useState("");
    const [munRes, setMunRes] = useState([]);

    // Stats globais
    useEffect(() => {
        fetch(`${API}/lookups/stats`).then(r => r.json()).then(setStats).catch(() => {});
    }, []);

    // Autocomplete CNAE
    useEffect(() => {
        if (cnaeQ.length < 2) { setCnaeRes([]); return; }
        const t = setTimeout(() => {
            fetch(`${API}/lookups/cnaes?q=${encodeURIComponent(cnaeQ)}`)
                .then(r => r.json()).then(d => setCnaeRes(d.rows));
        }, 250);
        return () => clearTimeout(t);
    }, [cnaeQ]);

    // Autocomplete Municipio
    useEffect(() => {
        if (munQ.length < 2) { setMunRes([]); return; }
        const t = setTimeout(() => {
            fetch(`${API}/lookups/municipios?q=${encodeURIComponent(munQ)}`)
                .then(r => r.json()).then(d => setMunRes(d.rows));
        }, 250);
        return () => clearTimeout(t);
    }, [munQ]);

    // Search
    const queryString = useMemo(() => {
        const p = new URLSearchParams();
        if (filters.uf) p.set("uf", filters.uf);
        if (filters.cnae_prefix) p.set("cnae_prefix", filters.cnae_prefix);
        if (filters.municipio_cod) p.set("municipio_cod", filters.municipio_cod);
        if (filters.porte.length) p.set("porte", filters.porte.join(","));
        if (filters.q) p.set("q", filters.q);
        if (filters.has_phone) p.set("has_phone", "true");
        if (filters.has_email) p.set("has_email", "true");
        p.set("page", String(page));
        p.set("per", String(per));
        return p.toString();
    }, [filters, page, per]);

    const search = () => {
        setLoading(true);
        fetch(`${API}/search?${queryString}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { search(); }, [queryString]);

    const togglePorte = (p) => {
        setFilters(f => ({
            ...f, porte: f.porte.includes(p) ? f.porte.filter(x => x !== p) : [...f.porte, p],
        }));
        setPage(1);
    };

    return (
        <div className="min-h-screen bg-bg">
            <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-ink">Leads BR · Seenup Digital</h1>
                    {stats && (
                        <p className="text-xs text-gray-500 mt-0.5">
                            {stats.estabelecimentos?.toLocaleString("pt-BR")} estabelecimentos · {stats.empresas?.toLocaleString("pt-BR")} empresas · base RF
                        </p>
                    )}
                </div>
                <a
                    href={`${API}/export.csv?${queryString}&max=50000`}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-semibold"
                >
                    Exportar CSV
                </a>
            </header>

            <div className="flex">
                {/* Sidebar filtros */}
                <aside className="w-72 bg-white border-r border-gray-200 p-4 min-h-[calc(100vh-65px)] space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Busca</label>
                        <input
                            type="text"
                            value={filters.q}
                            onChange={(e) => { setFilters({ ...filters, q: e.target.value }); setPage(1); }}
                            placeholder="razão social ou fantasia"
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:border-primary outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">UF</label>
                        <select
                            value={filters.uf}
                            onChange={(e) => { setFilters({ ...filters, uf: e.target.value, municipio_cod: "" }); setMunQ(""); setPage(1); }}
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:border-primary outline-none"
                        >
                            <option value="">Todos</option>
                            {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                        </select>
                    </div>

                    <div className="relative">
                        <label className="text-xs font-bold text-gray-600 uppercase">Município</label>
                        <input
                            type="text"
                            value={munQ}
                            onChange={(e) => setMunQ(e.target.value)}
                            placeholder="ex: UBERLANDIA"
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:border-primary outline-none"
                        />
                        {munRes.length > 0 && (
                            <ul className="absolute z-10 bg-white border rounded-lg mt-1 max-h-60 overflow-auto w-full shadow-lg">
                                {munRes.map(m => (
                                    <li key={m.codigo}>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                                            onClick={() => { setFilters({ ...filters, municipio_cod: m.codigo }); setMunQ(m.descricao); setMunRes([]); setPage(1); }}
                                        >
                                            {m.descricao}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {filters.municipio_cod && (
                            <button
                                onClick={() => { setFilters({ ...filters, municipio_cod: "" }); setMunQ(""); setPage(1); }}
                                className="text-xs text-primary mt-1 hover:underline"
                            >
                                Limpar município
                            </button>
                        )}
                    </div>

                    <div className="relative">
                        <label className="text-xs font-bold text-gray-600 uppercase">CNAE</label>
                        <input
                            type="text"
                            value={cnaeQ}
                            onChange={(e) => setCnaeQ(e.target.value)}
                            placeholder="ex: salão / 4711"
                            className="w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:border-primary outline-none"
                        />
                        {cnaeRes.length > 0 && (
                            <ul className="absolute z-10 bg-white border rounded-lg mt-1 max-h-60 overflow-auto w-full shadow-lg">
                                {cnaeRes.map(c => (
                                    <li key={c.codigo}>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100"
                                            onClick={() => { setFilters({ ...filters, cnae_prefix: c.codigo }); setCnaeQ(`${c.codigo} — ${c.descricao}`); setCnaeRes([]); setPage(1); }}
                                        >
                                            <span className="font-mono">{c.codigo}</span> {c.descricao}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {filters.cnae_prefix && (
                            <button
                                onClick={() => { setFilters({ ...filters, cnae_prefix: "" }); setCnaeQ(""); setPage(1); }}
                                className="text-xs text-primary mt-1 hover:underline"
                            >
                                Limpar CNAE
                            </button>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Porte</label>
                        <div className="mt-1 space-y-1">
                            {PORTES.map(p => (
                                <label key={p} className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={filters.porte.includes(p)} onChange={() => togglePorte(p)} />
                                    {p}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="border-t pt-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={filters.has_phone} onChange={(e) => { setFilters({ ...filters, has_phone: e.target.checked }); setPage(1); }} />
                            Com telefone
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={filters.has_email} onChange={(e) => { setFilters({ ...filters, has_email: e.target.checked }); setPage(1); }} />
                            Com email
                        </label>
                    </div>
                </aside>

                {/* Tabela */}
                <main className="flex-1 p-6 overflow-auto">
                    {/* Segmentos prontos */}
                    <div className="mb-6">
                        <h2 className="text-xs font-bold text-gray-600 uppercase mb-2">Segmentos rápidos</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {PRESETS.map(p => {
                                const active = filters.cnae_prefix === p.cnae;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            setFilters(f => ({ ...f, cnae_prefix: active ? "" : p.cnae }));
                                            setCnaeQ(active ? "" : `${p.cnae} — ${p.label}`);
                                            setPage(1);
                                        }}
                                        className={`px-3 py-2 rounded-lg text-xs text-left border transition ${
                                            active
                                                ? "bg-primary text-white border-primary shadow"
                                                : "bg-white text-ink border-gray-200 hover:border-primary hover:shadow-sm"
                                        }`}
                                    >
                                        <div className="text-lg mb-0.5">{p.emoji}</div>
                                        <div className="font-semibold leading-tight">{p.label}</div>
                                        <div className={`text-[10px] font-mono ${active ? "text-white/70" : "text-gray-400"}`}>
                                            CNAE {p.cnae}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            {loading ? "Carregando..." : `${data.total.toLocaleString("pt-BR")} leads encontrados`}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                className="px-3 py-1 border rounded text-sm disabled:opacity-40">‹</button>
                            <span className="text-sm text-gray-600 self-center">página {page}</span>
                            <button onClick={() => setPage(p => p + 1)} disabled={page * per >= data.total}
                                className="px-3 py-1 border rounded text-sm disabled:opacity-40">›</button>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-primary text-white">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">CNPJ</th>
                                    <th className="text-left px-3 py-2 font-semibold">Razão Social</th>
                                    <th className="text-left px-3 py-2 font-semibold">Fantasia</th>
                                    <th className="text-left px-3 py-2 font-semibold">Porte</th>
                                    <th className="text-left px-3 py-2 font-semibold">CNAE</th>
                                    <th className="text-left px-3 py-2 font-semibold">Telefone</th>
                                    <th className="text-left px-3 py-2 font-semibold">Email</th>
                                    <th className="text-left px-3 py-2 font-semibold">Município</th>
                                    <th className="text-left px-3 py-2 font-semibold">UF</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map((r, i) => (
                                    <tr key={r.cnpj + i} className="border-t border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-2 font-mono text-xs">{formatCnpj(r.cnpj)}</td>
                                        <td className="px-3 py-2">{r.razao_social}</td>
                                        <td className="px-3 py-2 text-gray-600">{r.nome_fantasia}</td>
                                        <td className="px-3 py-2">{r.porte}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{r.cnae_codigo}</td>
                                        <td className="px-3 py-2">{r.telefone}</td>
                                        <td className="px-3 py-2 text-gray-600">{r.email}</td>
                                        <td className="px-3 py-2">{r.municipio}</td>
                                        <td className="px-3 py-2">{r.uf}</td>
                                    </tr>
                                ))}
                                {data.rows.length === 0 && !loading && (
                                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">Nenhum lead encontrado. Ajuste os filtros.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>
        </div>
    );
}

function formatCnpj(c) {
    if (!c || c.length !== 14) return c;
    return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
}
