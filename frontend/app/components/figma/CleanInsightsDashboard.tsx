import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RefreshCw, TrendingUp, Users, Clock, Target, AlertTriangle, CheckCircle, BarChart3, PieChart, Activity, Zap, ArrowUpRight, Trophy, Crown, Star, Medal, Award, Download, FileText } from 'lucide-react';
import { exportInsightsAsPDF } from '../../utils/exportUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { getApiUrl } from '../../../lib/api-config';

interface Project {
  id: string;
  key: string;
  name: string;
}

interface JiraMetrics {
  totalIssues: number;
  resolvedIssues: number;
  openIssues: number;
  bugs: number;
  stories: number;
  tasks: number;
  epics: number;
  subtasks: number;
  storyPoints: number;
  sprintVelocity: number;
  avgResolutionTime: number;
  issuesByStatus: Record<string, number>;
  issuesByPriority: Record<string, number>;
  issuesByAssignee: Record<string, number>;
}

interface RecentActivity {
  id: string;
  type: string;
  title: string;
  user: string;
  timestamp: string;
  project: string;
}

interface Performer {
  name: string;
  issuesResolved: number;
  issuesCreated: number;
  avgResolutionTime: number;
  storyPoints: number;
  bugsFixed: number;
  tasksCompleted: number;
  performanceScore: number;
  rank: number;
  achievements: string[];
  streak: number;
  lastActive: string;
}

export default function CleanInsightsDashboard() {
  const { currentTheme, isThemeLoaded } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [jiraMetrics, setJiraMetrics] = useState<JiraMetrics | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [bestPerformers, setBestPerformers] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);

  // Calculate best performers when jiraMetrics changes
  useEffect(() => {
    if (jiraMetrics && jiraMetrics.issuesByAssignee) {
      console.log('jiraMetrics changed, calculating best performers...');
      fetchBestPerformers();
    }
  }, [jiraMetrics]);

  // Load cached data on mount
  useEffect(() => {
    loadCachedData();
    fetchData();
  }, [selectedProject]);

  const loadCachedData = () => {
    try {
      const cachedProjects = localStorage.getItem('jira-projects');
      const cachedMetrics = localStorage.getItem('jira-metrics');
      const cachedActivities = localStorage.getItem('recent-activities');
      const cachedLastRefresh = localStorage.getItem('last-refresh');

      if (cachedProjects) {
        setProjects(JSON.parse(cachedProjects));
      }
      if (cachedMetrics) {
        setJiraMetrics(JSON.parse(cachedMetrics));
      }
      if (cachedActivities) {
        setRecentActivities(JSON.parse(cachedActivities));
      }
      if (cachedLastRefresh) {
        setLastRefresh(new Date(cachedLastRefresh));
      }
    } catch (error) {
      console.error('Error loading cached data:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchProjects(),
        fetchJiraMetrics(),
        fetchRecentActivities()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load insights data');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira/projects`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
        localStorage.setItem('jira-projects', JSON.stringify(data.projects || []));
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchJiraMetrics = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira/metrics?project=${selectedProject}`);
      if (response.ok) {
        const data = await response.json();
        setJiraMetrics(data);
        localStorage.setItem('jira-metrics', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error fetching Jira metrics:', error);
    }
  };

  const fetchRecentActivities = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira/recent-activities?project=${selectedProject}`);
      if (response.ok) {
        const data = await response.json();
        setRecentActivities(data.activities || []);
        localStorage.setItem('recent-activities', JSON.stringify(data.activities || []));
      }
    } catch (error) {
      console.error('Error fetching recent activities:', error);
    }
  };

  const fetchBestPerformers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira/best-performers?project=${selectedProject}`);
      if (response.ok) {
        const data = await response.json();
        setBestPerformers(data.performers || []);
      }
    } catch (error) {
      console.error('Error fetching best performers:', error);
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    setLastRefresh(new Date());
    localStorage.setItem('last-refresh', new Date().toISOString());
    await fetchData();
    setIsRefreshing(false);
  };

  const handleExportPDF = async () => {
    try {
      const insightsData = {
        projects,
        selectedProject,
        jiraMetrics,
        recentActivities,
        bestPerformers,
        lastRefresh
      };
      
      await exportInsightsAsPDF(insightsData, `insights-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
    }
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, trend }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: { value: number; isPositive: boolean };
  }) => (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-black">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowUpRight className={`w-4 h-4 mr-1 ${
                  trend.isPositive ? 'rotate-0' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-gray-100">
            <Icon className="w-6 h-6 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const CompletionRateCard = ({ title, value, subtitle, icon: Icon, trend }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: { value: number; isPositive: boolean };
  }) => (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-black">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowUpRight className={`w-4 h-4 mr-1 ${
                  trend.isPositive ? 'rotate-0' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-gray-100">
            <Icon className="w-6 h-6 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StoryPointsCard = ({ title, value, subtitle, icon: Icon, trend }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: { value: number; isPositive: boolean };
  }) => (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-black">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowUpRight className={`w-4 h-4 mr-1 ${
                  trend.isPositive ? 'rotate-0' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-gray-100">
            <Icon className="w-6 h-6 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const AvgResolutionCard = ({ title, value, subtitle, icon: Icon, trend }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: { value: number; isPositive: boolean };
  }) => (
    <Card className="bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold text-black">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center mt-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowUpRight className={`w-4 h-4 mr-1 ${
                  trend.isPositive ? 'rotate-0' : 'rotate-180'
                }`} />
                {trend.value}%
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-gray-100">
            <Icon className="w-6 h-6 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="h-full bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-black">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time insights from your Jira workspace</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-48 bg-white border-gray-300">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.key}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={refreshData}
              disabled={isRefreshing}
              className="bg-[#FF4500] hover:bg-[#E03E00] text-white"
            >
              {isRefreshing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Last Updated */}
        <div className="mb-6 text-sm text-gray-500">
          Last updated: {lastRefresh.toLocaleString()}
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Grid */}
        {jiraMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Issues"
              value={jiraMetrics.totalIssues}
              subtitle="Across all projects"
              icon={BarChart3}
            />
            <CompletionRateCard
              title="Completion Rate"
              value={`${Math.round((jiraMetrics.resolvedIssues / jiraMetrics.totalIssues) * 100)}%`}
              subtitle={`${jiraMetrics.resolvedIssues} of ${jiraMetrics.totalIssues} resolved`}
              icon={RefreshCw}
            />
            <StoryPointsCard
              title="Story Points"
              value={jiraMetrics.storyPoints}
              subtitle={`Sprint velocity: ${jiraMetrics.sprintVelocity}`}
              icon={Target}
            />
            <AvgResolutionCard
              title="Avg Resolution"
              value={`${jiraMetrics.avgResolutionTime}d`}
              subtitle="Days to resolve"
              icon={Clock}
            />
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Issue Types */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <PieChart className="w-5 h-5 mr-2 text-[#FF4500]" />
                Issue Types
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {jiraMetrics && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-black">{jiraMetrics.totalIssues}</div>
                    <div className="text-sm text-gray-600">Total Issues</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-gray-700">Stories</span>
                      </div>
                      <span className="text-sm font-medium text-black">{jiraMetrics.stories}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                        <span className="text-sm text-gray-700">Epics</span>
                      </div>
                      <span className="text-sm font-medium text-black">{jiraMetrics.epics}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-gray-700">Tasks</span>
                      </div>
                      <span className="text-sm font-medium text-black">{jiraMetrics.tasks}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-sm text-gray-700">Bugs</span>
                      </div>
                      <span className="text-sm font-medium text-black">{jiraMetrics.bugs}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-[#FF4500]" />
                Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {jiraMetrics && (
                <div className="space-y-4">
                  {Object.entries(jiraMetrics.issuesByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          status === 'To Do' ? 'bg-yellow-100' :
                          status === 'In Progress' ? 'bg-blue-100' :
                          status === 'Done' ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {status === 'To Do' && <Target className="w-4 h-4 text-yellow-600" />}
                          {status === 'In Progress' && <Activity className="w-4 h-4 text-blue-600" />}
                          {status === 'Done' && <CheckCircle className="w-4 h-4 text-green-600" />}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{status}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-sm text-gray-600">{count} issues</div>
                        <Badge variant="outline" className={`${
                          status === 'To Do' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                          status === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          status === 'Done' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {count}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-lg font-bold text-green-600">{jiraMetrics.resolvedIssues}</div>
                        <div className="text-xs text-gray-600">Completed</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-blue-600">{jiraMetrics.openIssues - (jiraMetrics.issuesByStatus['Done'] || 0)}</div>
                        <div className="text-xs text-gray-600">Active</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-yellow-600">{jiraMetrics.issuesByStatus['To Do'] || 0}</div>
                        <div className="text-xs text-gray-600">Pending</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        {recentActivities.length > 0 && (
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-black flex items-center">
                <Activity className="w-5 h-5 mr-2 text-[#FF4500]" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="space-y-4">
                {recentActivities.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-8 h-8 bg-[#FF4500] rounded-full flex items-center justify-center flex-shrink-0">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black">{activity.title}</p>
                      <p className="text-xs text-gray-600">
                        {activity.user} • {activity.timestamp} • {activity.project}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
