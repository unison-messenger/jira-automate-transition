import * as core from '@actions/core';
import * as github from '@actions/github';
import * as Webhooks from '@octokit/webhooks';

import { getArgs } from './get-args';
import { Github } from './github';
import { handleTransitionIssue } from './handlers';
import { ParsedResult } from './interfaces';

async function run() {
  try {
    console.log("Parsing args...")
    const { parsedInput, success, exit, message } = getArgs() as ParsedResult;
    if (!parsedInput && !success && exit && message) {
      core.warning(message);
    } else if (!parsedInput) {
      throw new Error("Error trying to parse input.");
    } else {
      const context = github.context;
      const {
        repo: { owner, repo },
        payload,
        eventName
      } = context;

      console.log(`Event name: ${eventName}, action: ${payload.action}`)
      let isOpened = eventName === "pull_request_target" && payload.action === "opened"
      let isReviewRequested = eventName === "pull_request" && payload.action === "review_requested"
      let isReviewSubmitted = eventName === "pull_request_review" && payload.action === "submitted"
      let isPrClosed = eventName === "pull_request" && payload.action === "closed"

      if (isOpened || isReviewRequested) {
        const {
          pull_request: {
            head: { ref }
          }
        } = payload as Webhooks.EventPayloads.WebhookPayloadPullRequest;
        console.log(`Branch name: ${ref}`)
        core.info(`Branch name: ${ref}`);
        await handleTransitionIssue({
          ...parsedInput,
          colName: parsedInput.columnToMoveToWhenReviewRequested,
          branchName: ref
        });
      } else if (isReviewSubmitted) {
        const {
          pull_request: {
            number,
            head: { ref }
          },
          review: { id }
        } = context.payload as Webhooks.EventPayloads.WebhookPayloadPullRequestReview;
        const { githubToken } = parsedInput;
        const githubWrapper = new Github(githubToken, owner, repo);
        const isRequestChange = await githubWrapper.checkReviewIsRequestChange({
          pull_number: number,
          review_id: id
        });
        if (isRequestChange) {
          core.info(`Branch name: ${ref}`);
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenChangesRequested,
            branchName: ref
          });
        }
      } else if (isPrClosed) {
        const {
          pull_request: {
            merged,
            head: { ref }
          }
        } = payload as Webhooks.EventPayloads.WebhookPayloadPullRequest;
        if (merged && parsedInput.columnToMoveToWhenMerged) {
          core.info(`Branch name: ${ref}`);
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenMerged,
            branchName: ref
          });
        }
      } else {
        console.log(`Unsupported github event: ${eventName}, action: ${payload.action}`)
      }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
