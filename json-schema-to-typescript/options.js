const { basename } = require("path");

module.exports.DEFAULT_OPTIONS = {
  refToNameResolver: (refPath) => basename(refPath),
  // $refOptions: {},
  additionalProperties: false, // TODO: default to empty schema (as per spec) instead
  bannerComment: "",
  cwd: process.cwd(),
  declareExternallyReferenced: false,
  enableConstEnums: false,
  format: false,
  ignoreMinAndMaxItems: false,
  maxItems: 20,
  strictIndexSignatures: false,
  unreachableDefinitions: false,
  unknownAny: true,
  style: {
    // bracketSpacing: true,
    // printWidth: 120,
    // semi: true,
    // singleQuote: true,
    // tabWidth: 2,
    // trailingComma: 'none',
    // useTabs: false,

    // ...{
    // 	jsdocPrintWidth: 20,
    // 	jsdocSpaces: 4,
    // 	jsdocSingleLineComment: true,
    // } as JsdocOptions,

    semi: true,
    trailingComma: "all",
    singleQuote: true,
    printWidth: 90,
    tabWidth: 2,
    jsxBracketSameLine: true,
    endOfLine: "auto",
    useTabs: false,
    proseWrap: "preserve",
    //plugins: [jsDoc_pretty_plug as PrettyPlug],
  },
};
