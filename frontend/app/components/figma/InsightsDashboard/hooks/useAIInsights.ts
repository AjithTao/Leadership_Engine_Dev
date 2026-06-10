'use client'

import { useState } from 'react';
import { JiraMetrics } from './useInsightsData';
import { Performer } from './useBestPerformers';

export interface AISuggestion {
  component: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
}

export function useAIInsights(
  jiraMetrics: JiraMetrics | null,
  bestPerformers: Performer[]
) {
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  const generateAIInsights = async () => {
    if (!jiraMetrics || !bestPerformers.length) return;
    
    setIsGeneratingInsights(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const suggestions: AISuggestion[] = [];
      
      // Analyze workload distribution
      if (jiraMetrics.issuesByAssignee) {
        const assignees = Object.entries(jiraMetrics.issuesByAssignee);

        if (assignees.length > 0) {
          const counts = assignees.map(([_, count]) => count);
          const maxWorkload = Math.max(...counts);
          const minWorkload = Math.min(...counts);
          const workloadDifference = maxWorkload - minWorkload;
          
          if (workloadDifference > 5) {
            const overloadedPerson = assignees.find(([_, count]) => count === maxWorkload)?.[0];
            const underloadedPerson = assignees.find(([_, count]) => count === minWorkload)?.[0];
            
            if (overloadedPerson && underloadedPerson) {
              suggestions.push({
                component: 'workload',
                suggestion: `Workload imbalance detected! ${overloadedPerson} has ${maxWorkload} issues while ${underloadedPerson} has only ${minWorkload}. Consider redistributing 2-3 issues from ${overloadedPerson} to ${underloadedPerson} to balance the team workload.`,
                priority: 'high',
                actionable: true
              });
            }
          }
        }
      }
      
      // Analyze team performance
      if (bestPerformers.length > 0) {
        const topPerformer = bestPerformers[0];
        const bottomPerformer = bestPerformers[bestPerformers.length - 1];
        
        if (topPerformer.performanceScore - bottomPerformer.performanceScore > 30) {
          suggestions.push({
            component: 'performance',
            suggestion: `Performance gap identified! ${topPerformer.name} is excelling (${topPerformer.performanceScore} score) while ${bottomPerformer.name} needs support (${bottomPerformer.performanceScore} score). Consider pairing them for knowledge transfer or providing additional training for ${bottomPerformer.name}.`,
            priority: 'medium',
            actionable: true
          });
        }
      }
      
      // Analyze priority distribution
      if (jiraMetrics.issuesByPriority) {
        const priorities = Object.entries(jiraMetrics.issuesByPriority);
        const highPriority = priorities.find(([priority]) => priority.toLowerCase().includes('high'))?.[1] || 0;
        const totalIssues = jiraMetrics.totalIssues;
        const highPriorityPercentage = (highPriority / totalIssues) * 100;
        
        if (highPriorityPercentage > 20) {
          suggestions.push({
            component: 'priority',
            suggestion: `High priority overload! ${highPriorityPercentage.toFixed(1)}% of issues are high priority (${highPriority}/${totalIssues}). This may indicate scope creep or insufficient planning. Consider reviewing and potentially downgrading some high-priority issues to medium priority.`,
            priority: 'high',
            actionable: true
          });
        }
      }
      
      // Analyze completion rate
      const completionRate = (jiraMetrics.resolvedIssues / jiraMetrics.totalIssues) * 100;
      if (completionRate < 60) {
        suggestions.push({
          component: 'completion',
          suggestion: `Low completion rate detected (${completionRate.toFixed(1)}%). This suggests potential bottlenecks in the development process. Consider implementing daily standups, breaking down large tasks, or reviewing the current workflow to identify and remove blockers.`,
          priority: 'high',
          actionable: true
        });
      }
      
      // Analyze resolution times
      if (jiraMetrics.avgResolutionTime > 7) {
        suggestions.push({
          component: 'resolution',
          suggestion: `Long resolution times detected (${jiraMetrics.avgResolutionTime} days average). This impacts team velocity and customer satisfaction. Consider implementing better task estimation, clearer requirements, or additional resources for complex issues.`,
          priority: 'medium',
          actionable: true
        });
      }
      
      // Analyze bug-to-story ratio
      const bugRatio = (jiraMetrics.bugs / jiraMetrics.stories) * 100;
      if (bugRatio > 30) {
        suggestions.push({
          component: 'quality',
          suggestion: `High bug ratio detected (${bugRatio.toFixed(1)}% bugs vs stories). This indicates potential quality issues. Consider implementing better testing practices, code reviews, or allocating more time for quality assurance in the development process.`,
          priority: 'medium',
          actionable: true
        });
      }
      
      setAiSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  const toggleAIInsights = async () => {
    if (!aiInsightsEnabled) {
      await generateAIInsights();
    }
    setAiInsightsEnabled(!aiInsightsEnabled);
  };

  const getAISuggestion = (component: string): AISuggestion | null => {
    return aiSuggestions.find(suggestion => suggestion.component === component) || null;
  };

  return {
    aiInsightsEnabled,
    aiSuggestions,
    activeTooltip,
    isGeneratingInsights,
    setActiveTooltip,
    generateAIInsights,
    toggleAIInsights,
    getAISuggestion
  };
}

