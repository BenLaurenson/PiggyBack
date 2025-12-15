/**
 * Formula Evaluator for Custom Budget Columns
 *
 * Supports placeholders like {assigned}, {spent}, {income}, etc.
 * Supports operators: +, -, *, /, ()
 * Supports functions: MAX, MIN, ROUND, ABS, FLOOR, CEIL
 * Supports special: DAYS_REMAINING()
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

    // Replace math functions (case insensitive)
    expr = expr.replace(/MAX\(/gi, 'Math.max(');
    expr = expr.replace(/MIN\(/gi, 'Math.min(');
    expr = expr.replace(/ROUND\(/gi, 'Math.round(');
    expr = expr.replace(/ABS\(/gi, 'Math.abs(');
    expr = expr.replace(/FLOOR\(/gi, 'Math.floor(');
    expr = expr.replace(/CEIL\(/gi, 'Math.ceil(');

    // Safe evaluation
    const result = safeEval(expr);
    return typeof result === 'number' && !isNaN(result) ? result : null;

  } catch (error) {
    console.error('Formula evaluation error:', error, 'Formula:', formula);
    return null;
  }
}

/**
 * Safely evaluate mathematical expression
 * Only allows numbers, operators, parentheses, and Math functions
 */
function safeEval(expr: string): number {
  // Whitelist: numbers, operators, parentheses, Math object, dots, commas
  const allowedPattern = /^[\d+\-*/(). ,Math.maxinroudflce]+$/;

  if (!allowedPattern.test(expr)) {
    throw new Error('Formula contains invalid characters');
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /eval/i,
    /function/i,
    /=>/,
    /\[/,
    /\]/,
    /import/i,
    /require/i,
    /process/i,
    /global/i,
    /window/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(expr)) {
      throw new Error('Formula contains forbidden syntax');
    }
  }

  // Use Function constructor (safer than eval)
  const result = new Function(`'use strict'; return (${expr})`)();

  if (typeof result !== 'number') {
    throw new Error('Formula must evaluate to a number');
  }

  return result;
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

