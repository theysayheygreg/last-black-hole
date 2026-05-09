const fs = require("fs");
const path = require("path");

class SessionRegistry {
  constructor(filepath) {
    this.filepath = path.resolve(filepath);
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.filepath, "utf8"));
    } catch {
      return {
        version: 1,
        sessions: {},
      };
    }
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    fs.writeFileSync(this.filepath, `${JSON.stringify(state, null, 2)}\n`);
  }
}

module.exports = {
  SessionRegistry,
};
