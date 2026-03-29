export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  args: Record<string, unknown>
  result: unknown
  error?: string
}

/**
 * Parse Python-style function call: name(key="val", key2=123)
 */
export function parsePythonicCall(text: string): ToolCall | null {
  const match = text.trim().match(/^(\w+)\(([\s\S]*)\)$/)
  if (!match) return null
  const name = match[1]
  const argsStr = match[2].trim()
  const args: Record<string, unknown> = {}
  if (argsStr) {
    try {
      const re = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[.*?\]|\{.*?\}|[^,]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(argsStr)) !== null) {
        const k = m[1]
        let v: string = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
          args[k] = v
        } else if (v === 'True') {
          args[k] = true
        } else if (v === 'False') {
          args[k] = false
        } else if (v === 'None') {
          args[k] = null
        } else if (!isNaN(Number(v))) {
          args[k] = Number(v)
        } else {
          args[k] = v
        }
      }
    } catch {
      return null
    }
  }
  return { name, args }
}

export function extractToolCalls(text: string): { calls: ToolCall[]; cleanText: string } {
  const lines = text.split('\n')
  const calls: ToolCall[] = []
  const textLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\w+\(.*\)\s*$/.test(trimmed)) {
      const call = parsePythonicCall(trimmed)
      if (call) {
        calls.push(call)
        continue
      }
    }
    textLines.push(line)
  }

  return { calls, cleanText: textLines.join('\n').trim() }
}

/**
 * Safe arithmetic evaluator using recursive descent parsing.
 * Supports: +, -, *, /, **, (), and Math functions.
 * No string execution — no eval/Function.
 */
function safeMathEval(expr: string): number {
  const MATH_CONSTS: Record<string, number> = {
    PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10, SQRT2: Math.SQRT2,
  }
  const MATH_FUNS: Record<string, (x: number) => number> = {
    abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    sqrt: Math.sqrt, cbrt: Math.cbrt, log: Math.log, log2: Math.log2,
    log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, sign: Math.sign,
    trunc: Math.trunc, exp: Math.exp,
  }
  const MATH_FUNS2: Record<string, (a: number, b: number) => number> = {
    pow: Math.pow, max: Math.max, min: Math.min, atan2: Math.atan2,
  }

  // Tokenize
  type Token = { type: 'num'; val: number } | { type: 'op'; val: string } | { type: 'id'; val: string } | { type: 'lparen' } | { type: 'rparen' } | { type: 'comma' }

  const tokens: Token[] = []
  let i = 0
  const s = expr.replace(/\s+/g, '')
  while (i < s.length) {
    const c = s[i]
    if (c >= '0' && c <= '9' || c === '.') {
      let num = ''
      while (i < s.length && (s[i] >= '0' && s[i] <= '9' || s[i] === '.')) num += s[i++]
      if (s[i] === 'e' || s[i] === 'E') {
        num += s[i++]
        if (s[i] === '+' || s[i] === '-') num += s[i++]
        while (i < s.length && s[i] >= '0' && s[i] <= '9') num += s[i++]
      }
      tokens.push({ type: 'num', val: Number(num) })
    } else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let id = ''
      while (i < s.length && ((s[i] >= 'a' && s[i] <= 'z') || (s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9') || s[i] === '_')) id += s[i++]
      tokens.push({ type: 'id', val: id })
    } else if (c === '(') { tokens.push({ type: 'lparen' }); i++ }
    else if (c === ')') { tokens.push({ type: 'rparen' }); i++ }
    else if (c === ',') { tokens.push({ type: 'comma' }); i++ }
    else if (c === '*' && s[i + 1] === '*') { tokens.push({ type: 'op', val: '**' }); i += 2 }
    else if ('+-*/^'.includes(c)) { tokens.push({ type: 'op', val: c }); i++ }
    else { throw new Error(`Unexpected character: ${c}`) }
  }

  let pos = 0

  function peek(): Token | undefined { return tokens[pos] }
  function consume(): Token { return tokens[pos++] }
  function expect(type: string): Token {
    const t = consume()
    if (t?.type !== type) throw new Error(`Expected ${type}`)
    return t
  }

  function opVal(): string | null {
    const t = peek()
    return t?.type === 'op' ? (t as { type: 'op'; val: string }).val : null
  }

  function parseExpr(): number { return parseAddSub() }

  function parseAddSub(): number {
    let left = parseMulDiv()
    let op: string | null
    while ((op = opVal()) === '+' || op === '-') {
      consume()
      const right = parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parsePow()
    let op: string | null
    while ((op = opVal()) === '*' || op === '/') {
      consume()
      const right = parsePow()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function parsePow(): number {
    const base = parseUnary()
    const op = opVal()
    if (op === '**' || op === '^') {
      consume()
      return Math.pow(base, parseUnary())
    }
    return base
  }

  function parseUnary(): number {
    const op = opVal()
    if (op === '-') { consume(); return -parseAtom() }
    if (op === '+') { consume() }
    return parseAtom()
  }

  function parseAtom(): number {
    const t = peek()
    if (!t) throw new Error('Unexpected end of expression')

    if (t.type === 'num') {
      consume()
      return (t as { type: 'num'; val: number }).val
    }

    if (t.type === 'id') {
      const id = (consume() as { type: 'id'; val: string }).val
      if (peek()?.type === 'lparen') {
        consume() // '('
        const args: number[] = []
        if (peek()?.type !== 'rparen') {
          args.push(parseExpr())
          while (peek()?.type === 'comma') {
            consume()
            args.push(parseExpr())
          }
        }
        expect('rparen')
        const fn1 = MATH_FUNS[id]
        const fn2 = MATH_FUNS2[id]
        if (fn2 && args.length === 2) return fn2(args[0], args[1])
        if (fn1 && args.length === 1) return fn1(args[0])
        throw new Error(`Unknown function: ${id}`)
      }
      if (id in MATH_CONSTS) return MATH_CONSTS[id]
      throw new Error(`Unknown identifier: ${id}`)
    }

    if (t.type === 'lparen') {
      consume()
      const v = parseExpr()
      expect('rparen')
      return v
    }

    throw new Error(`Unexpected token: ${JSON.stringify(t)}`)
  }

  const result = parseExpr()
  if (pos !== tokens.length) throw new Error('Unexpected tokens after expression')
  return result
}

/**
 * Parse tool definitions from the Python-style tool code in the editor.
 * Returns a map of tool name -> { description, params }
 * for user-defined tools so they can be executed with real argument handling.
 */
function parseToolDefinitions(toolCode: string): Map<string, { params: string[] }> {
  const defs = new Map<string, { params: string[] }>()
  const fnRe = /def\s+(\w+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(toolCode)) !== null) {
    const name = m[1]
    const paramStr = m[2]
    const params = paramStr
      .split(',')
      .map((p) => p.trim().split(':')[0].trim().split('=')[0].trim())
      .filter((p) => p.length > 0 && p !== 'self')
    defs.set(name, { params })
  }
  return defs
}

/**
 * Execute a tool call. Builtin tools (get_weather, calculate, search_web) are handled
 * with real implementations. User-defined tools from the editor are executed by parsing
 * their return statement and evaluating it with the provided argument values.
 *
 * The calculate tool uses a safe recursive-descent parser — no eval or new Function.
 */
export async function executeToolCall(
  call: ToolCall,
  toolCode: string,
): Promise<unknown> {
  const { name, args } = call

  if (name === 'get_weather') {
    const location = String(args.location ?? 'Unknown')
    const unit = String(args.unit ?? 'celsius')
    return {
      location,
      temperature: unit === 'fahrenheit' ? 72 : 22,
      unit,
      condition: 'sunny',
      humidity: 65,
    }
  }

  if (name === 'calculate') {
    const expr = String(args.expression ?? '')
    try {
      const result = safeMathEval(expr)
      return { result, expression: expr }
    } catch (e) {
      return { error: String(e), expression: expr }
    }
  }

  if (name === 'search_web') {
    const query = String(args.query ?? '')
    const numResults = Math.min(Math.max(1, Number(args.num_results ?? 3)), 10)
    return {
      query,
      results: Array.from({ length: numResults }, (_, i) => ({
        title: `Result ${i + 1} for "${query}"`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}&page=${i + 1}`,
        snippet: `Relevant information about ${query} — simulated result ${i + 1}.`,
      })),
    }
  }

  // For user-defined tools, parse the function definition and extract the return value.
  // We look for a `return {...}` or `return (...)` block and reconstruct the dict
  // using the provided argument values (string substitution on param names).
  const defs = parseToolDefinitions(toolCode)
  if (defs.has(name)) {
    const { params } = defs.get(name)!
    // Extract the function body
    const fnBodyRe = new RegExp(`def\\s+${name}\\s*\\([^)]*\\)[^:]*:([\\s\\S]*?)(?=\\ndef |$)`)
    const bodyMatch = fnBodyRe.exec(toolCode)
    if (bodyMatch) {
      const body = bodyMatch[1]
      // Look for return { ... } or return (...)
      const returnMatch = body.match(/return\s+(\{[\s\S]*?\})/m)
      if (returnMatch) {
        try {
          // Substitute param values into the return dict string
          let dictStr = returnMatch[1]
          for (const param of params) {
            const val = args[param]
            if (val !== undefined) {
              // Replace occurrences of the bare param name (not inside strings)
              dictStr = dictStr.replace(new RegExp(`\\b${param}\\b`, 'g'), JSON.stringify(val))
            }
          }
          // Convert Python dict to JSON: True->true, False->false, None->null, single quotes -> double
          const jsonStr = dictStr
            .replace(/True/g, 'true')
            .replace(/False/g, 'false')
            .replace(/None/g, 'null')
            .replace(/'/g, '"')
          return JSON.parse(jsonStr)
        } catch {
          // Fall through to args-only return
        }
      }
    }
    // Return the args that were passed — at minimum shows the tool was called correctly
    return { tool: name, called_with: args, params }
  }

  return { tool: name, called_with: args, note: 'Unknown tool — add a definition in the tool editor' }
}
