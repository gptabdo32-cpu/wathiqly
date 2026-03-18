import { Octokit } from "@octokit/rest";
import axios from "axios";
import { ENV } from "./env.js";

/**
 * Milestone Verification Service
 * Handles automated verification of milestone completion
 * Supports GitHub commits, PRs, URL checks, and external APIs
 */

interface VerificationResult {
  verified: boolean;
  timestamp: number;
  details: Record<string, any>;
  error?: string;
}

interface GitHubCommitVerification {
  repo: string; // format: "owner/repo"
  commitSha: string;
}

interface GitHubPRVerification {
  repo: string; // format: "owner/repo"
  prNumber: number;
}

interface URLCheckVerification {
  url: string;
  expectedStatus?: number;
}

interface ExternalAPIVerification {
  apiUrl: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: Record<string, any>;
  expectedResponseKey?: string;
}

class MilestoneVerificationService {
  private octokit: Octokit | null = null;

  constructor() {
    if (ENV.githubToken) {
      this.octokit = new Octokit({ auth: ENV.githubToken });
    }
  }

  /**
   * Verify GitHub commit
   */
  async verifyGitHubCommit(
    data: GitHubCommitVerification
  ): Promise<VerificationResult> {
    if (!this.octokit) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: "GitHub token not configured",
      };
    }

    try {
      const [owner, repo] = data.repo.split("/");

      const commit = await this.octokit.repos.getCommit({
        owner,
        repo,
        ref: data.commitSha,
      });

      return {
        verified: true,
        timestamp: Date.now(),
        details: {
          commitSha: commit.data.sha,
          author: commit.data.commit.author?.name,
          message: commit.data.commit.message,
          url: commit.data.html_url,
          timestamp: commit.data.commit.author?.date,
        },
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: `Failed to verify GitHub commit: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify GitHub Pull Request
   */
  async verifyGitHubPR(
    data: GitHubPRVerification
  ): Promise<VerificationResult> {
    if (!this.octokit) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: "GitHub token not configured",
      };
    }

    try {
      const [owner, repo] = data.repo.split("/");

      const pr = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: data.prNumber,
      });

      // Check if PR is merged
      const isMerged = pr.data.merged;

      return {
        verified: isMerged,
        timestamp: Date.now(),
        details: {
          prNumber: pr.data.number,
          title: pr.data.title,
          state: pr.data.state,
          merged: pr.data.merged,
          mergedAt: pr.data.merged_at,
          url: pr.data.html_url,
          author: pr.data.user?.login,
        },
        error: !isMerged ? "Pull request is not merged" : undefined,
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: `Failed to verify GitHub PR: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify GitHub Issue Closure
   */
  async verifyGitHubIssueClosure(
    repo: string,
    issueNumber: number
  ): Promise<VerificationResult> {
    if (!this.octokit) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: "GitHub token not configured",
      };
    }

    try {
      const [owner, repoName] = repo.split("/");

      const issue = await this.octokit.issues.get({
        owner,
        repo: repoName,
        issue_number: issueNumber,
      });

      const isClosed = issue.data.state === "closed";

      return {
        verified: isClosed,
        timestamp: Date.now(),
        details: {
          issueNumber: issue.data.number,
          title: issue.data.title,
          state: issue.data.state,
          closedAt: issue.data.closed_at,
          url: issue.data.html_url,
        },
        error: !isClosed ? "Issue is not closed" : undefined,
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: {},
        error: `Failed to verify GitHub issue: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify URL accessibility and status
   */
  async verifyURLCheck(
    data: URLCheckVerification
  ): Promise<VerificationResult> {
    try {
      const response = await axios.head(data.url, {
        timeout: 5000,
        validateStatus: () => true, // Don't throw on any status
      });

      const expectedStatus = data.expectedStatus || 200;
      const isValid = response.status === expectedStatus;

      return {
        verified: isValid,
        timestamp: Date.now(),
        details: {
          url: data.url,
          statusCode: response.status,
          expectedStatus,
          contentType: response.headers["content-type"],
        },
        error: !isValid ? `Expected status ${expectedStatus}, got ${response.status}` : undefined,
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: { url: data.url },
        error: `Failed to verify URL: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify external API call
   */
  async verifyExternalAPI(
    data: ExternalAPIVerification
  ): Promise<VerificationResult> {
    try {
      const config: any = {
        method: data.method,
        url: data.apiUrl,
        timeout: 10000,
        validateStatus: () => true,
      };

      if (data.headers) {
        config.headers = data.headers;
      }

      if (data.body && data.method === "POST") {
        config.data = data.body;
      }

      const response = await axios(config);

      let verified = response.status >= 200 && response.status < 300;

      // Check for expected response key if provided
      if (verified && data.expectedResponseKey) {
        const keys = data.expectedResponseKey.split(".");
        let value = response.data;

        for (const key of keys) {
          value = value?.[key];
        }

        verified = value !== undefined && value !== null;
      }

      return {
        verified,
        timestamp: Date.now(),
        details: {
          apiUrl: data.apiUrl,
          statusCode: response.status,
          responseSize: JSON.stringify(response.data).length,
        },
        error: !verified ? `API verification failed with status ${response.status}` : undefined,
      };
    } catch (error) {
      return {
        verified: false,
        timestamp: Date.now(),
        details: { apiUrl: data.apiUrl },
        error: `Failed to verify external API: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Generic verification dispatcher
   */
  async verify(
    verificationType: string,
    verificationData: any
  ): Promise<VerificationResult> {
    switch (verificationType) {
      case "github_commit":
        return this.verifyGitHubCommit(verificationData);

      case "github_pr":
        return this.verifyGitHubPR(verificationData);

      case "github_issue":
        return this.verifyGitHubIssueClosure(
          verificationData.repo,
          verificationData.issueNumber
        );

      case "url_check":
        return this.verifyURLCheck(verificationData);

      case "external_api":
        return this.verifyExternalAPI(verificationData);

      case "manual":
        return {
          verified: false,
          timestamp: Date.now(),
          details: { type: "manual" },
          error: "Manual verification required",
        };

      default:
        return {
          verified: false,
          timestamp: Date.now(),
          details: {},
          error: `Unknown verification type: ${verificationType}`,
        };
    }
  }

  /**
   * Batch verify multiple milestones
   */
  async verifyMultiple(
    verifications: Array<{
      type: string;
      data: any;
    }>
  ): Promise<VerificationResult[]> {
    return Promise.all(
      verifications.map((v) => this.verify(v.type, v.data))
    );
  }

  /**
   * Check if all verifications passed
   */
  allVerified(results: VerificationResult[]): boolean {
    return results.every((result) => result.verified);
  }

  /**
   * Get verification summary
   */
  getSummary(results: VerificationResult[]): {
    totalVerifications: number;
    passedVerifications: number;
    failedVerifications: number;
    successRate: number;
  } {
    const passed = results.filter((r) => r.verified).length;
    const failed = results.length - passed;

    return {
      totalVerifications: results.length,
      passedVerifications: passed,
      failedVerifications: failed,
      successRate: results.length > 0 ? (passed / results.length) * 100 : 0,
    };
  }
}

export const milestoneVerificationService = new MilestoneVerificationService();
