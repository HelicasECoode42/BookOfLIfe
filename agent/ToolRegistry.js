export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.defaultBlockedTools = new Set([
      'write_confirmed',
      'write_confirmed_fact',
      'append_confirmed_fact',
      'delete_memory',
      'delete_confirmed_fact',
      'export_secret',
      'read_secret'
    ]);
  }

  register(tool) {
    if (!tool || typeof tool.name !== 'string' || typeof tool.execute !== 'function') {
      throw new Error('Invalid tool registration.');
    }
    this.tools.set(tool.name, {
      description: '',
      risk: 'read',
      inputSchema: { type: 'object', properties: {} },
      ...tool
    });
    return this;
  }

  has(name) {
    return this.tools.has(name);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      risk: tool.risk,
      inputSchema: tool.inputSchema
    }));
  }

  validateInput(tool, input = {}) {
    const schema = tool.inputSchema;
    if (!schema || !schema.properties) return input;
    const errors = [];
    const normalized = { ...input };
    (schema.required || []).forEach((key) => {
      const val = input[key];
      if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
        errors.push(`missing required: ${key}`);
      }
    });
    Object.entries(schema.properties).forEach(([key, def]) => {
      const val = input[key];
      if (val === undefined || val === null) return;
      if (def.type === 'number' && typeof val !== 'number') {
        const num = Number(val);
        if (!Number.isFinite(num)) {
          errors.push(`type error: ${key} should be number`);
        } else {
          normalized[key] = num;
        }
      }
      if (def.type === 'string' && typeof val !== 'string') {
        normalized[key] = String(val);
      }
      if (def.type === 'array' && !Array.isArray(val)) {
        errors.push(`type error: ${key} should be array`);
      }
      if (def.type === 'object' && (typeof val !== 'object' || Array.isArray(val) || val === null)) {
        errors.push(`type error: ${key} should be object`);
      }
    });
    if (errors.length) {
      const err = new Error(`Input validation failed for ${tool.name}: ${errors.join('; ')}`);
      err.validationErrors = errors;
      throw err;
    }
    return normalized;
  }

  async call(name, input = {}, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown agent tool: ${name}`);
    }
    const blockedTools = new Set([
      ...this.defaultBlockedTools,
      ...(Array.isArray(context.blockedTools) ? context.blockedTools : [])
    ]);
    if (tool.risk === 'write_confirmed' && !context.allowConfirmedWrites) {
      throw new Error('Confirmed memory writes require explicit user confirmation.');
    }
    if (tool.risk === 'secret') {
      throw new Error('Secret-bearing tools are not available to the Agent.');
    }
    if (blockedTools.has(name)) {
      throw new Error(`Agent tool is blocked by policy: ${name}`);
    }
    const validated = this.validateInput(tool, input);
    return tool.execute(validated, context);
  }
}
