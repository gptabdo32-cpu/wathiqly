/**
 * Rules Engine for Smart Escrow
 * Manages complex conditions for automatic fund release
 * Supports AND/OR logic, comparisons, and time-based conditions
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

export interface Condition {
  field: string; // e.g., "temperature", "location.latitude", "status"
  operator: ComparisonOperator;
  value: any;
  type?: "string" | "number" | "boolean" | "array";
}

export interface RuleAction {
  type: "release_funds" | "trigger_dispute" | "send_notification" | "update_status";
  payload?: Record<string, any>;
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
    radius: number; // in meters
  };
  status?: string;
  timestamp?: number;
  [key: string]: any;
}

class RulesEngine {
  private rules: Map<string, Rule> = new Map();

  /**
   * Register a new rule
   */
  registerRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a rule
   */
  unregisterRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get all enabled rules
   */
  getEnabledRules(): Rule[] {
    return Array.from(this.rules.values()).filter((rule) => rule.enabled);
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: Condition,
    context: EvaluationContext
  ): boolean {
    const contextValue = this.getNestedValue(context, condition.field);

    if (contextValue === undefined) {
      console.warn(`Field not found in context: ${condition.field}`);
      return false;
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
          condition.value.includes(contextValue);

      case "contains":
        return String(contextValue).includes(String(condition.value));

      default:
        console.warn(`Unknown operator: ${condition.operator}`);
        return false;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split(".");
    let value = obj;

    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Evaluate all conditions in a rule
   */
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

  /**
   * Evaluate a single rule against context
   */
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

  /**
   * Evaluate all rules against context
   */
  evaluateAllRules(
    context: EvaluationContext
  ): Array<{ rule: Rule; matched: boolean }> {
    const enabledRules = this.getEnabledRules();

    return enabledRules.map((rule) => ({
      rule,
      matched: this.evaluateRule(rule, context),
    }));
  }

  /**
   * Get matching rules that should trigger actions
   */
  getMatchingRules(context: EvaluationContext): Rule[] {
    return this.evaluateAllRules(context)
      .filter((result) => result.matched)
      .map((result) => result.rule);
  }

  /**
   * Check if location is within target radius (Geofencing)
   */
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

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  /**
   * Create a predefined rule for temperature monitoring
   */
  static createTemperatureRule(
    minTemp: number,
    maxTemp: number
  ): Rule {
    return {
      id: `temp_rule_${Date.now()}`,
      name: "Temperature Monitoring",
      description: `Monitor temperature between ${minTemp}°C and ${maxTemp}°C`,
      conditions: [
        {
          field: "temperature",
          operator: "gte",
          value: minTemp,
          type: "number",
        },
        {
          field: "temperature",
          operator: "lte",
          value: maxTemp,
          type: "number",
        },
      ],
      logicalOperator: "AND",
      action: {
        type: "release_funds",
      },
      enabled: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a predefined rule for geofencing
   */
  static createGeofenceRule(
    targetLatitude: number,
    targetLongitude: number,
    radiusMeters: number
  ): Rule {
    return {
      id: `geofence_rule_${Date.now()}`,
      name: "Geofence Verification",
      description: `Verify location within ${radiusMeters}m of target`,
      conditions: [
        {
          field: "location",
          operator: "eq",
          value: {
            latitude: targetLatitude,
            longitude: targetLongitude,
            radius: radiusMeters,
          },
        },
      ],
      logicalOperator: "AND",
      action: {
        type: "release_funds",
      },
      enabled: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a predefined rule for status verification
   */
  static createStatusRule(expectedStatus: string): Rule {
    return {
      id: `status_rule_${Date.now()}`,
      name: "Status Verification",
      description: `Verify status is ${expectedStatus}`,
      conditions: [
        {
          field: "status",
          operator: "eq",
          value: expectedStatus,
          type: "string",
        },
      ],
      logicalOperator: "AND",
      action: {
        type: "release_funds",
      },
      enabled: true,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a complex rule with multiple conditions
   */
  static createComplexRule(
    conditions: Condition[],
    logicalOperator: LogicalOperator = "AND"
  ): Rule {
    return {
      id: `complex_rule_${Date.now()}`,
      name: "Complex Verification",
      description: "Complex rule with multiple conditions",
      conditions,
      logicalOperator,
      action: {
        type: "release_funds",
      },
      enabled: true,
      createdAt: Date.now(),
    };
  }
}

export const rulesEngine = new RulesEngine();
