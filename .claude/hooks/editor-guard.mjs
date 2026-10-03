// PreToolUse hook del agente "editor": bloquea commits y escrituras en base de datos.
// Recibe el JSON del hook por stdin; sale con código 2 (y motivo en stderr) para bloquear.

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { tool_name = '', tool_input = {} } = JSON.parse(Buffer.concat(chunks).toString() || '{}');

const SQL_WRITE = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|replace|upsert|copy|vacuum|reindex|call|exec|execute|attach|detach)\b/i;
const MONGO_WRITE = /\.(insert|update|delete|drop|remove|replace|create|rename|bulkWrite|findOneAnd)\w*\s*\(/i;
const DB_CLIENT = /\b(psql|mysql|mariadb|sqlite3|sqlcmd|mongosh|mongo|duckdb|clickhouse-client)\b/i;
const DB_MIGRATION = /\b(prisma\s+(migrate|db\s+(push|execute|seed))|drizzle-kit\s+(push|migrate|drop)|supabase\s+db\s+(push|reset)|knex\s+(migrate|seed)|sequelize\s+db:|typeorm\s+(migration:run|schema:sync|schema:drop))\b/i;
const GIT_COMMIT = /\bgit\b(\s+(-C\s+\S+|-c\s+\S+|--?[\w-]+(=\S+)?))*\s+(commit|push|merge|rebase|cherry-pick|revert|am|pull)\b/i;
const GH_MERGE = /\bgh\s+pr\s+merge\b/i;

function block(reason) {
  process.stderr.write(`Bloqueado por el agente editor: ${reason}`);
  process.exit(2);
}

if (tool_name === 'Bash' || tool_name === 'PowerShell') {
  const cmd = String(tool_input.command ?? '');
  if (GIT_COMMIT.test(cmd) || GH_MERGE.test(cmd)) block('no puede hacer commits, push, merge ni operaciones que creen commits.');
  if (DB_MIGRATION.test(cmd)) block('no puede ejecutar migraciones ni cambios de esquema en base de datos.');
  if (DB_CLIENT.test(cmd)) {
    if (/(^|\s)(-f|--file)(\s|=)|\s<\s*\S|\\i\b/.test(cmd)) block('no puede ejecutar ficheros SQL contra la base de datos; pasa la consulta SELECT directamente.');
    if (SQL_WRITE.test(cmd) || MONGO_WRITE.test(cmd)) block('solo puede hacer consultas de lectura (SELECT) en base de datos.');
  }
}

if (tool_name.startsWith('mcp__')) {
  const server = tool_name.split('__')[1] ?? '';
  if (/git(hub|lab)?/i.test(server) && /(commit|push|merge|create_or_update_file)/i.test(tool_name)) {
    block('no puede crear commits ni hacer push/merge.');
  }
  if (/(postgres|mysql|sqlite|supabase|neon|mongo|sql|db|prisma|planetscale|turso)/i.test(server)) {
    if (/(insert|update|delete|drop|create|alter|truncate|migrat|write)/i.test(tool_name)) block('solo puede hacer consultas de lectura en base de datos.');
    const text = JSON.stringify(tool_input);
    if (SQL_WRITE.test(text) || MONGO_WRITE.test(text)) block('solo puede hacer consultas de lectura (SELECT) en base de datos.');
  }
}

process.exit(0);
