/**
 * Inspect the Intervals.icu OpenAPI spec.
 *
 * The spec is the source of truth for endpoint paths and field names, both of
 * which are only loosely documented elsewhere. Use this before adding a new
 * endpoint to the client.
 *
 *   node scripts/icu-spec.mjs paths wellness
 *   node scripts/icu-spec.mjs endpoint "/api/v1/athlete/{id}/activities"
 *   node scripts/icu-spec.mjs schema Activity
 */

const SPEC_URL = "https://intervals.icu/api/v1/docs";
const REF = "$ref";

const spec = await fetch(SPEC_URL).then((response) => {
  if (!response.ok) throw new Error(`Failed to fetch spec: HTTP ${response.status}`);
  return response.json();
});

function resolve(ref) {
  return ref
    .replace("#/", "")
    .split("/")
    .reduce((node, key) => node[key], spec);
}

function typeName(schema) {
  if (!schema) return "?";
  if (schema[REF]) return schema[REF].split("/").pop();
  if (schema.type === "array") return `${typeName(schema.items)}[]`;
  return schema.format ? `${schema.type}(${schema.format})` : (schema.type ?? "object");
}

function fieldsOf(schema) {
  if (!schema) return null;
  if (schema[REF]) return fieldsOf(resolve(schema[REF]));
  if (schema.type === "array") return fieldsOf(schema.items);
  return schema.properties ? Object.keys(schema.properties) : null;
}

const [command, argument] = process.argv.slice(2);

if (command === "paths") {
  const matches = Object.keys(spec.paths).filter((path) =>
    argument ? path.includes(argument) : true,
  );
  for (const path of matches.sort()) {
    console.log(`${path}  [${Object.keys(spec.paths[path]).join(", ")}]`);
  }
  console.log(`\n${matches.length} of ${Object.keys(spec.paths).length} paths`);
} else if (command === "endpoint") {
  const methods = spec.paths[argument];
  if (!methods) throw new Error(`No such path: ${argument}`);

  for (const [method, operation] of Object.entries(methods)) {
    console.log(`### ${method.toUpperCase()} ${argument}`);
    if (operation.summary) console.log(`  summary: ${operation.summary}`);

    const params = (operation.parameters ?? []).map(
      (p) => `${p.name}${p.required ? "*" : ""}: ${typeName(p.schema)}`,
    );
    console.log(`  params: ${params.join(", ") || "(none)"}`);

    const ok = operation.responses?.["200"];
    const schema = (ok?.content?.["application/json"] ?? ok?.content?.["*/*"])?.schema;
    if (schema) {
      console.log(`  returns: ${typeName(schema)}`);
      const fields = fieldsOf(schema);
      if (fields) console.log(`  fields (${fields.length}): ${fields.join(", ")}`);
    }
    console.log("");
  }
} else if (command === "schema") {
  const schema = spec.components.schemas[argument];
  if (!schema) throw new Error(`No such schema: ${argument}`);

  console.log(`### ${argument}`);
  for (const [field, definition] of Object.entries(schema.properties ?? {})) {
    const required = (schema.required ?? []).includes(field) ? "*" : "";
    console.log(`  ${field}${required}: ${typeName(definition)}`);
  }
} else {
  console.log(
    [
      "Usage:",
      "  node scripts/icu-spec.mjs paths [substring]",
      "  node scripts/icu-spec.mjs endpoint <path>",
      "  node scripts/icu-spec.mjs schema <SchemaName>",
    ].join("\n"),
  );
  process.exitCode = 1;
}
