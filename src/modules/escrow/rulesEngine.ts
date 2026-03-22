import { z } from "zod";

/**
 * Rules Engine for Smart Escrow (Hardened & Strict)
 * MISSION: Deterministic distributed financial system
 * RULE 13: Remove all "any" types
 * RULE 14: Harden RulesEngine with strict typing
 * RULE 15: Prevent silent failures
 */

export const ComparisonOperatorSchema = z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"]);
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

export const LogicalOperatorSchema = z.enum(["AND", "OR"]);
export type LogicalOperator = z.infer<typeof LogicalOperatorSchema>;

export const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number())
]);
export type ConditionValue = z.infer<typeof ConditionValueSchema>;

export const ConditionSchema = z.object({
  field: z.string(),
  operator: ComparisonOperatorSchema,
  value: ConditionValueSchema,
  type: z.enum(["string", "number", "boolean", "array"]),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const RuleActionSchema = z.object({
  type: z.enum(["release_funds", "trigger_dispute", "send_notification", "update_status"]),
  payload: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const RuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  conditions: z.array(ConditionSchema),
  logicalOperator: LogicalOperatorSchema,
  action: RuleActionSchema,
  enabled: z.boolean(),
  createdAt: z.number(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const EvaluationContextSchema = z.record(z.any()).and(z.object({
  timestamp: z.number(),
}));
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;

class RulesEngine {
  private rules: Map<string, Rule> = new Map();

  registerRule(ruleData: unknown): void {
    const rule = RuleSchema.parse(ruleData);
    this.rules.set(rule.id, rule);
  }

  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  getEnabledRules(): Rule[] {
    return Array.from(this.rules.values()).filter((rule) => rule.enabled);
  }

  private evaluateCondition(
    condition: Condition,
    context: EvaluationContext
  ): boolean {
    const contextValue = this.getNestedValue(context, condition.field);

    if (contextValue === undefined) {
      // RULE 15: Prevent silent failures
      throw new Error(`Rule Evaluation Error: Field '${condition.field}' not found in context`);
    }

    switch (condition.operator) {
      case "eq":
        return contextValue === condition.value;

      case "ne":
        return contextValue !== condition.value;

      case "gt":
        return Number(contextValue) > Number(condition.value);

      case "gte":
        return Number(contextValue) >= Number(condition.value);

      case "lt":
        return Number(contextValue) < Number(condition.value);

      case "lte":
        return Number(contextValue) <= Number(condition.value);

      case "in":
        if (!Array.isArray(condition.value)) return false;
        return (condition.value as (string | number)[]).includes(contextValue as string | number);

      case "contains":
        return String(contextValue).includes(String(condition.value));

      default:
        const _exhaustiveCheck: never = condition.operator;
        throw new Error(`Rule Evaluation Error: Unknown operator '${_exhaustiveCheck}'`);
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let value: unknown = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in (value as object)) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private evaluateConditions(
    conditions: Condition[],
    logicalOperator: LogicalOperator,
    context: EvaluationContext
  ): boolean {
    if (conditions.length === 0) {
      return true;
    }

    const results = conditions.map((condition) =>
      this.evaluateCondition(condition, context)
    );

    if (logicalOperator === "AND") {
      return results.every((result) => result === true);
    } else if (logicalOperator === "OR") {
      return results.some((result) => result === true);
    }

    return false;
  }

  evaluateRule(rule: Rule, context: EvaluationContext): boolean {
    if (!rule.enabled) {
      return false;
    }

    return this.evaluateConditions(
      rule.conditions,
      rule.logicalOperator,
      context
    );
  }

  evaluateAllRules(
    context: EvaluationContext
  ): Array<{ rule: Rule; matched: boolean }> {
    const enabledRules = this.getEnabledRules();

    return enabledRules.map((rule) => ({
      rule,
      matched: this.evaluateRule(rule, context),
    }));
  }

  getMatchingRules(context: EvaluationContext): Rule[] {
    return this.evaluateAllRules(context)
      .filter((result) => result.matched)
      .map((result) => result.rule);
  }
}

export const rulesEngine = new RulesEngine();
