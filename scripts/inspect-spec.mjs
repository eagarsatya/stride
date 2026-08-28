import { readFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const REF = "$ref";

function resolve(ref) {
  return ref
    .replace("#/", "")
    .split("/")
    .reduce((acc, key) => acc[key], spec);
}

function fieldsOf(schema, depth = 0) {
  if (!schema) return null;
  if (schema[REF]) return fieldsOf(resolve(schema[REF]), depth);
  if (schema.type === "array" && schema.items) return fieldsOf(schema.items, depth);
  if (schema.properties) return Object.keys(schema.properties);
  return null;
}

function show(path, method = "get") {
  const op = spec.paths[path]?.[method];
  if (!op) {
    console.log(`MISSING ${method.toUpperCase()} ${path}\n`);
    return;
  }

  console.log(`### ${method.toUpperCase()} ${path}`);
  if (op.summary) console.log(`  summary: ${op.summary}`);

  const params = (op.parameters ?? []).map(
    (p) => `${p.name}${p.required ? "*" : ""}:${p.schema?.type ?? p.schema?.[REF] ?? "?"}`,
  );
  console.log(`  params: ${params.join(", ") || "(none)"}`);

  const ok = op.responses?.["200"];
  const content = ok?.content?.["application/json"] ?? ok?.content?.["*/*"];
  const schema = content?.schema;

  if (!schema) {
    console.log(`  200: ${JSON.stringify(ok?.content ?? {}).slice(0, 160)}`);
  } else {
    const isArray = schema.type === "array";
    console.log(`  200: ${isArray ? "array of" : ""} ${schema[REF] ?? schema.items?.[REF] ?? schema.type}`);
    const fields = fieldsOf(schema);
    if (fields) console.log(`  fields (${fields.length}): ${fields.join(", ")}`);
  }
  console.log("");
}

for (const arg of process.argv.slice(3)) {
  const [path, method] = arg.split("|");
  show(path, method ?? "get");
}
