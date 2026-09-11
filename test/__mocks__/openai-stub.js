function OpenAI() {
  this.chat = {
    completions: {
      create: async () => ({ choices: [] }),
    },
  };
}

module.exports = OpenAI;
