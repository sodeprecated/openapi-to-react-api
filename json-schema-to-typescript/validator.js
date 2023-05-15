const { traverse } = require("./utils");

const rules = new Map();

rules.set(
  "Enum members and tsEnumNames must be of the same length",
  (schema) => {
    if (
      schema &&
      schema.enum &&
      schema.tsEnumNames &&
      schema.enum.length !== schema.tsEnumNames.length
    ) {
      return false;
    }

    return undefined;
  }
);

rules.set("tsEnumNames must be an array of strings", (schema) => {
  if (
    schema &&
    schema.tsEnumNames &&
    schema.tsEnumNames.some((_) => typeof _ !== "string")
  ) {
    return false;
  }

  return undefined;
});

rules.set(
  "When both maxItems and minItems are present, maxItems >= minItems",
  (schema) => {
    if (!schema) {
      return undefined;
    }
    const { maxItems, minItems } = schema;
    if (typeof maxItems === "number" && typeof minItems === "number") {
      return maxItems >= minItems;
    }

    return undefined;
  }
);

rules.set("When maxItems exists, maxItems >= 0", (schema) => {
  if (!schema) {
    return undefined;
  }
  const { maxItems } = schema;
  if (typeof maxItems === "number") {
    return maxItems >= 0;
  }

  return undefined;
});

rules.set("When minItems exists, minItems >= 0", (schema) => {
  if (!schema) {
    return undefined;
  }
  const { minItems } = schema;
  if (typeof minItems === "number") {
    return minItems >= 0;
  }

  return undefined;
});

module.exports.validate = (schema, filename) => {
  const errors = [];
  rules.forEach((rule, ruleName) => {
    traverse(schema, (schema, key) => {
      if (rule(schema) === false) {
        errors.push(`Error at key "${key}" in file "${filename}": ${ruleName}`);
      }
      return schema;
    });
  });
  return errors;
};
