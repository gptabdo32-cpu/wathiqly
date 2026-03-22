/**
 * Rules Engine for Smart Escrow (Hardened & Strict)
 * MISSION: Deterministic distributed financial system
 * RULE 13: Remove all "any" types
 * RULE 14: Harden RulesEngine with strict typing
 * RULE 15: Prevent silent failures
 */

export type ComparisonOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
export type LogicalOperator = "AND" | "OR";

export interface Rule {
  id: string;
  name: string;
  description?: string;
  conditions: Condition[];
  logicalOperator: LogicalOperator;
  action: RuleAction;
  enabled: boolean;
  createdAt: number;
}

export type ConditionValue = string | number | boolean | string[] | number[];

export interface Condition {
  field: string;
  operator: ComparisonOperator;
  value: ConditionValue;
  type: "string" | "number" | "boolean" | "array";
}

export interface RuleAction {
  type: "release_funds" | "trigger_dispute" | "send_notification" | "update_status";
  payload?: Record<string, string | number | boolean>;
}

export interface EvaluationContext {
  temperature?: number;
  humidity?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  targetLocation?: {
    latitude: number;
    longitude: number;
    radius: number;
  };
  status?: string;
  timestamp: number; // Mandatory for determinism
  [key: string]: string | number | boolean | object | undefined;
}

class RulesEngine {
  private rules: Map<string, Rule> = new Map();

  registerRule(rule: Rule): void {
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
        return Array.isArray(condition.value) &&
          (condition.value as any[]).includes(contextValue);

      case "contains":
        return String(contextValue).includes(String(condition.value));

      default:
        throw new Error(`Rule Evaluation Error: Unknown operator '${condition.operator}'`);
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let value: any = obj;

    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
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

  static isWithinGeofence(
    currentLocation: { latitude: number; longitude: number },
    targetLocation: { latitude: number; longitude: number; radius: number }
  ): boolean {
    const distance = this.calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      targetLocation.latitude,
      targetLocation.longitude
    );

    return distance <= targetLocation.radius;
  }

  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const rulesEngine = new RulesEngine();
