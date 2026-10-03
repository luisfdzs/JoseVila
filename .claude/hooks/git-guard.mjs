// PreToolUse hook del agente "git": solo permite comandos git y controla los mensajes de commit.
// Recibe el JSON del hook por stdin; sale con código 2 (y motivo en stderr) para bloquear.

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { tool_name = '', tool_input = {} } = JSON.parse(Buffer.concat(chunks).toString() || '{}');

function block(reason) {
  process.stderr.write(`Bloqueado por el agente git: ${reason}`);
  process.exit(2);
}

if (tool_name !== 'Bash') block('solo puede ejecutar comandos git con la herramienta Bash.');

const cmd = String(tool_input.command ?? '').trim();

// Sin sustituciones, heredocs ni redirecciones: evitan colar otros comandos o escribir ficheros.
if (/\$\(|`|<<|[<>]/.test(cmd)) block('no se permiten sustituciones de comandos, heredocs ni redirecciones.');

// Cada tramo encadenado (&&, ||, ;, |, salto de línea) debe ser un comando git.
for (const segment of cmd.split(/&&|\|\||[;|\n]/)) {
  const s = segment.trim();
  if (s && !/^git(\s|$)/.test(s)) block(`solo puede ejecutar comandos git (encontrado: "${s.slice(0, 40)}").`);
}

// Nada que permita ejecutar shell arbitraria ni cambiar la identidad del autor.
if (/\bgit\s+(-C\s+\S+\s+)?-c\b/.test(cmd)) block('no se permite sobrescribir configuración con "git -c".');
if (/\bgit\s+config\b[^;&|\n]*\b(alias\.|core\.|user\.|credential\.|url\.)/i.test(cmd)) {
  block('no puede cambiar alias, core, user, credential ni url en la configuración de git.');
}
if (/--author\b|--exec\b|\s-x\s/.test(cmd)) block('no se permiten --author, --exec ni -x.');
if (/\bgit\s+(filter-branch|filter-repo)\b/.test(cmd)) block('no se permite reescribir el historial completo.');

// Push forzado a test/prod.
if (/\bgit\s+push\b/.test(cmd) && /(\s--force(-with-lease)?\b|\s-f\b|\s\+)/.test(cmd) && /\b(test|prod)\b/.test(cmd)) {
  block('no se permite push forzado a test ni a prod.');
}

// Commits: mensaje con -m, breve y sin atribución a Claude.
if (/\bgit\s+commit\b/.test(cmd)) {
  if (!/\s(-m|--message)(\s|=)/.test(cmd) && !/\s--no-edit\b/.test(cmd)) block('usa git commit -m "mensaje".');
  if (/co-authored-by|generated with|claude|anthropic|🤖/i.test(cmd)) block('el mensaje no puede atribuir autoría a Claude.');
  const messages = [...cmd.matchAll(/(?:-m|--message)[\s=]+(?:"([^"]*)"|'([^']*)'|(\S+))/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  if (messages.length > 1) block('usa un único -m con un mensaje de una línea.');
  if (messages[0] && messages[0].length > 72) block('el mensaje debe ser breve (máximo 72 caracteres).');
}

process.exit(0);
