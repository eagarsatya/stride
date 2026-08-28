import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const REF = "$ref";

function typeOf(schema) {
  if (!schema) return "?";
  if (schema[REF]) return schema[REF].split("/").pop();
  if (schema.type === "array") return `${typeOf(schema.items)}[]`;
  return schema.format ? `${schema.type}(${schema.format})` : schema.type;
}

for (const name of process.argv.slice(3)) {
  const schema = spec.components.schemas[name];
  if (!schema) {
    console.log(`MISSING schema ${name}\n`);
    continue;
  }
  console.log(`### ${name}`);
  for (const [field, def] of Object.entries(schema.properties ?? {})) {
    const required = (schema.required ?? []).includes(field) ? "*" : "";
    console.log(`  ${field}${required}: ${typeOf(def)}`);
  }
  console.log("");
}
