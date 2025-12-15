/**
 * Formula Evaluator for Custom Budget Columns
 *
 * Supports placeholders like {assigned}, {spent}, {income}, etc.
 * Supports operators: +, -, *, /, ()
 * Supports functions: MAX, MIN, ROUND, ABS, FLOOR, CEIL
 * Supports special: DAYS_REMAINING()
 *
 * Uses a safe recursive descent parser — no eval(), new Function(),
 * or any dynamic code execution.
 */

export interface FormulaContext {
  assigned: number;
  spent: number;
  income: number;
  target?: number;
  currentAmount?: number;
  currentValue?: number;
  periodStart: Date;
  periodEnd: Date;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | 'NUMBER'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'FUNCTION'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

const SUPPORTED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  max: Math.max,
  min: Math.min,
  round: Math.round,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Number literal (integer or decimal)
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let hasDot = false;
      while (
        i < input.length &&
        ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')
      ) {
        if (input[i] === '.') {
          if (hasDot) break; // second dot ends the number
          hasDot = true;
        }
        num += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Alphabetic — must be a known function name
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let name = '';
      while (
        i < input.length &&
        ((input[i] >= 'a' && input[i] <= 'z') ||
          (input[i] >= 'A' && input[i] <= 'Z'))
      ) {
        name += input[i];
        i++;
      }
      const lower = name.toLowerCase();
      if (!(lower in SUPPORTED_FUNCTIONS)) {
        throw new Error(`Unknown function: ${name}`);
      }
      tokens.push({ type: 'FUNCTION', value: lower });
      continue;
    }

    switch (ch) {
      case '+':
        tokens.push({ type: 'PLUS', value: '+' });
        break;
      case '-':
        tokens.push({ type: 'MINUS', value: '-' });
        break;
      case '*':
        tokens.push({ type: 'STAR', value: '*' });
        break;
      case '/':
        tokens.push({ type: 'SLASH', value: '/' });
        break;
      case '(':
        tokens.push({ type: 'LPAREN', value: '(' });
        break;
      case ')':
        tokens.push({ type: 'RPAREN', value: ')' });
        break;
      case ',':
        tokens.push({ type: 'COMMA', value: ',' });
        break;
      default:
        throw new Error(`Unexpected character: ${ch}`);
    }
    i++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive Descent Parser / Evaluator
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(expected?: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (expected && tok.type !== expected) {
      throw new Error(`Expected ${expected} but got ${tok.type} ("${tok.value}")`);
    }
    this.pos++;
    return tok;
  }

  /**
   * expression → term (('+' | '-') term)*
   */
  parseExpression(): number {
    let result = this.parseTerm();

    while (
      this.peek().type === 'PLUS' ||
      this.peek().type === 'MINUS'
    ) {
      const op = this.consume();
      const right = this.parseTerm();
      result = op.type === 'PLUS' ? result + right : result - right;
    }

    return result;
  }

  /**
   * term → factor (('*' | '/') factor)*
   */
  private parseTerm(): number {
    let result = this.parseFactor();

    while (
      this.peek().type === 'STAR' ||
      this.peek().type === 'SLASH'
    ) {
      const op = this.consume();
      const right = this.parseFactor();
      if (op.type === 'STAR') {
        result = result * right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        result = result / right;
      }
    }

    return result;
  }

  /**
   * factor → NUMBER
   *        | FUNCTION '(' arglist ')'
   *        | '(' expression ')'
   *        | '-' factor          (unary minus)
   *        | '+' factor          (unary plus)
   */
  private parseFactor(): number {
    const tok = this.peek();

    // Unary minus
    if (tok.type === 'MINUS') {
      this.consume();
      return -this.parseFactor();
    }

    // Unary plus
    if (tok.type === 'PLUS') {
      this.consume();
      return this.parseFactor();
    }

    // Number literal
    if (tok.type === 'NUMBER') {
      this.consume();
      const n = Number(tok.value);
      if (isNaN(n)) {
        throw new Error(`Invalid number: ${tok.value}`);
      }
      return n;
    }

    // Function call: FUNCTION '(' arglist ')'
    if (tok.type === 'FUNCTION') {
      const fnName = this.consume().value;
      this.consume('LPAREN');

      const args: number[] = [];
      // Handle empty argument list
      if (this.peek().type !== 'RPAREN') {
        args.push(this.parseExpression());
        while (this.peek().type === 'COMMA') {
          this.consume(); // consume comma
          args.push(this.parseExpression());
        }
      }

      this.consume('RPAREN');

      const fn = SUPPORTED_FUNCTIONS[fnName];
      return fn(...args);
    }

    // Parenthesised expression
    if (tok.type === 'LPAREN') {
      this.consume();
      const result = this.parseExpression();
      this.consume('RPAREN');
      return result;
    }

    throw new Error(`Unexpected token: ${tok.type} ("${tok.value}")`);
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Safely evaluate a mathematical expression string.
 * Uses a recursive descent parser — no eval() or dynamic code execution.
 */
function safeEvaluate(expr: string): number {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  const result = parser.parseExpression();

  // Ensure all tokens were consumed
  if (parser['pos'] < tokens.length - 1) {
    // tokens.length - 1 because the last token is EOF
    throw new Error('Unexpected content after expression');
  }

  return result;
}

/**
 * Evaluate a formula expression with given context
 * @param formula - Formula string with placeholders like "{assigned} - {spent}"
 * @param context - Values to substitute into formula
 * @returns Calculated result or null if error
 */
function evaluateFormula(
  formula: string,
  context: FormulaContext
): number | null {
  try {
    let expr = formula;

    // Replace field placeholders
    expr = expr.replace(/\{assigned\}/g, (context.assigned || 0).toString());
    expr = expr.replace(/\{spent\}/g, (context.spent || 0).toString());
    expr = expr.replace(/\{income\}/g, (context.income || 0).toString());
    expr = expr.replace(/\{target\}/g, (context.target || 0).toString());
    expr = expr.replace(/\{currentAmount\}/g, (context.currentAmount || 0).toString());
    expr = expr.replace(/\{currentValue\}/g, (context.currentValue || 0).toString());

    // Replace DAYS_REMAINING() function
    expr = expr.replace(/DAYS_REMAINING\(\)/g, () => {
      const now = new Date();
      const days = Math.ceil(
        (context.periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return Math.max(0, days).toString();
    });

    // Evaluate using safe recursive descent parser
    const result = safeEvaluate(expr);
    return typeof result === 'number' && !isNaN(result) ? result : null;

  } catch (error) {
    console.error('Formula evaluation error:', error, 'Formula:', formula);
    return null;
  }
}

/**
 * Validate formula syntax before saving
 * @param formula - Formula to validate
 * @returns Validation result with error message if invalid
 */
export function validateFormula(formula: string): {
  valid: boolean;
  error?: string;
} {
  if (!formula || formula.trim() === '') {
    return { valid: false, error: 'Formula cannot be empty' };
  }

  // Check for valid placeholders
  const placeholders = formula.match(/\{[a-zA-Z_]+\}/g) || [];
  const validPlaceholders = [
    '{assigned}',
    '{spent}',
    '{income}',
    '{target}',
    '{currentAmount}',
    '{currentValue}',
  ];

  for (const placeholder of placeholders) {
    if (!validPlaceholders.includes(placeholder)) {
      return {
        valid: false,
        error: `Unknown field: ${placeholder}. Valid fields: ${validPlaceholders.join(', ')}`
      };
    }
  }

  // Check balanced parentheses
  let depth = 0;
  for (const char of formula) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) {
      return { valid: false, error: 'Unbalanced parentheses: too many closing parentheses' };
    }
  }

  if (depth !== 0) {
    return { valid: false, error: 'Unbalanced parentheses: missing closing parentheses' };
  }

  // Test evaluation with dummy data
  try {
    const result = evaluateFormula(formula, {
      assigned: 1000,
      spent: 500,
      income: 5000,
      target: 10000,
      currentAmount: 2000,
      currentValue: 50000,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days ahead
    });

    if (result === null) {
      return { valid: false, error: 'Formula evaluation failed' };
    }

    return { valid: true };

  } catch (error: any) {
    return {
      valid: false,
      error: `Formula error: ${error.message || 'Invalid syntax'}`
    };
  }
}

