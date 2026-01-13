/**
 * Feature List Utilities
 * Manages feature list operations with Poka-yoke error prevention.
 * Implements safeguards to prevent accidental modification of test criteria.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { agentConfig } from "../config/agent-config.js";

/**
 * Feature definition matching the JSON schema
 */
export interface Feature {
  id: string;
  category: "functional" | "ui" | "integration" | "performance" | "accessibility";
  priority: number;
  description: string;
  steps: string[];
  passes: boolean;
  last_tested: string | null;
  tested_by?: string | null;
  notes: string;
}

/**
 * Project metadata in feature list
 */
export interface ProjectInfo {
  name: string;
  description: string;
  created_at: string;
  stack: string;
}

/**
 * Complete feature list structure
 */
export interface FeatureList {
  project: ProjectInfo;
  features: Feature[];
  metadata: {
    total_features: number;
    passing_features: number;
    last_updated: string;
  };
}

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Load the feature list from disk
 */
export function loadFeatureList(): FeatureList | null {
  const path = agentConfig.paths.featureList;
  
  if (!existsSync(path)) {
    return null;
  }
  
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as FeatureList;
  } catch (error) {
    console.error("Error loading feature list:", error);
    return null;
  }
}

/**
 * Save the feature list to disk
 */
export function saveFeatureList(featureList: FeatureList): boolean {
  const path = agentConfig.paths.featureList;
  
  try {
    // Update metadata before saving
    featureList.metadata.total_features = featureList.features.length;
    featureList.metadata.passing_features = featureList.features.filter(f => f.passes).length;
    featureList.metadata.last_updated = new Date().toISOString();
    
    const content = JSON.stringify(featureList, null, 2);
    writeFileSync(path, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error saving feature list:", error);
    return false;
  }
}

/**
 * Poka-yoke validation: Ensure feature list updates don't violate constraints
 * 
 * CONSTRAINTS:
 * - Cannot delete features
 * - Cannot modify feature steps (test criteria)
 * - Cannot modify feature descriptions
 * - Can only update: passes, last_tested, notes
 */
export function validateFeatureListUpdate(
  original: FeatureList,
  updated: FeatureList
): ValidationResult {
  const warnings: string[] = [];
  
  // Rule 1: Cannot delete features
  if (updated.features.length < original.features.length) {
    return {
      valid: false,
      error: `Cannot delete features. Original: ${original.features.length}, Updated: ${updated.features.length}`,
    };
  }
  
  // Rule 2: Cannot modify existing features' steps or descriptions
  for (const originalFeat of original.features) {
    const updatedFeat = updated.features.find(f => f.id === originalFeat.id);
    
    if (!updatedFeat) {
      return {
        valid: false,
        error: `Feature ${originalFeat.id} was removed. This is not allowed.`,
      };
    }
    
    // Check if steps were modified
    if (JSON.stringify(originalFeat.steps) !== JSON.stringify(updatedFeat.steps)) {
      return {
        valid: false,
        error: `Cannot modify test steps for feature ${originalFeat.id}. Steps are immutable.`,
      };
    }
    
    // Check if description was modified
    if (originalFeat.description !== updatedFeat.description) {
      return {
        valid: false,
        error: `Cannot modify description for feature ${originalFeat.id}. Descriptions are immutable.`,
      };
    }
    
    // Check if category was modified
    if (originalFeat.category !== updatedFeat.category) {
      return {
        valid: false,
        error: `Cannot modify category for feature ${originalFeat.id}. Categories are immutable.`,
      };
    }
    
    // Warn if passes changed from true to false (regression)
    if (originalFeat.passes && !updatedFeat.passes) {
      warnings.push(`Feature ${originalFeat.id} regressed from passing to failing.`);
    }
  }
  
  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Get the next feature to work on (highest priority failing feature)
 */
export function getNextFeature(featureList: FeatureList): Feature | null {
  const failingFeatures = featureList.features
    .filter(f => !f.passes)
    .sort((a, b) => a.priority - b.priority);
  
  return failingFeatures[0] || null;
}

/**
 * Mark a feature as passing
 */
export function markFeaturePassing(
  featureList: FeatureList,
  featureId: string,
  notes?: string
): FeatureList {
  const feature = featureList.features.find(f => f.id === featureId);
  
  if (feature) {
    feature.passes = true;
    feature.last_tested = new Date().toISOString();
    if (notes) {
      feature.notes = notes;
    }
  }
  
  return featureList;
}

/**
 * Get progress statistics
 */
export function getProgressStats(featureList: FeatureList): {
  total: number;
  passing: number;
  failing: number;
  percentage: number;
  byCategory: Record<string, { passing: number; total: number }>;
} {
  const total = featureList.features.length;
  const passing = featureList.features.filter(f => f.passes).length;
  const failing = total - passing;
  
  const byCategory: Record<string, { passing: number; total: number }> = {};
  
  for (const feature of featureList.features) {
    if (!byCategory[feature.category]) {
      byCategory[feature.category] = { passing: 0, total: 0 };
    }
    const categoryStats = byCategory[feature.category];
    if (categoryStats) {
      categoryStats.total++;
      if (feature.passes) {
        categoryStats.passing++;
      }
    }
  }
  
  return {
    total,
    passing,
    failing,
    percentage: total > 0 ? Math.round((passing / total) * 100) : 0,
    byCategory,
  };
}

/**
 * Generate a progress report string
 */
export function generateProgressReport(featureList: FeatureList): string {
  const stats = getProgressStats(featureList);
  
  let report = `
═══════════════════════════════════════════════════════
                    PROGRESS REPORT
═══════════════════════════════════════════════════════

Project: ${featureList.project.name}
Last Updated: ${featureList.metadata.last_updated}

OVERALL PROGRESS: ${stats.passing}/${stats.total} (${stats.percentage}%)
${"█".repeat(Math.floor(stats.percentage / 5))}${"░".repeat(20 - Math.floor(stats.percentage / 5))}

BY CATEGORY:
`;

  for (const [category, catStats] of Object.entries(stats.byCategory)) {
    const catPercent = catStats.total > 0 
      ? Math.round((catStats.passing / catStats.total) * 100) 
      : 0;
    report += `  ${category.padEnd(15)} ${catStats.passing}/${catStats.total} (${catPercent}%)\n`;
  }

  report += `
═══════════════════════════════════════════════════════
`;

  return report;
}

export default {
  loadFeatureList,
  saveFeatureList,
  validateFeatureListUpdate,
  getNextFeature,
  markFeaturePassing,
  getProgressStats,
  generateProgressReport,
};
