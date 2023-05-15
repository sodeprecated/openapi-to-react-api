module.exports.hasComment = (ast) => {
  return "comment" in ast && ast.comment != null && ast.comment !== "";
};

module.exports.hasStandaloneName = (ast) => {
  return (
    "standaloneName" in ast &&
    ast.standaloneName != null &&
    ast.standaloneName !== ""
  );
};

module.exports.T_ANY = {
  type: "ANY",
};

module.exports.T_ANY_ADDITIONAL_PROPERTIES = {
  keyName: "[k: string]",
  type: "ANY",
};

module.exports.T_UNKNOWN = {
  type: "UNKNOWN",
};

module.exports.T_UNKNOWN_ADDITIONAL_PROPERTIES = {
  keyName: "[k: string]",
  type: "UNKNOWN",
};
