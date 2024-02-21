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

      let isPullRequest = (eventName === "pull_request_target" || eventName === "pull_request")
      let isReview = eventName === "pull_request_review"

      let isOpened = isPullRequest && payload.action === "opened"
      let isPrReopened = isPullRequest && payload.action === "reopened"
      let isReadyForReview = isPullRequest && payload.action === "ready_for_review"
      let isReviewRequested = isPullRequest && payload.action === "review_requested"

      let isConvertedToDraft = isPullRequest && payload.action === "converted_to_draft"
      let isPrClosed = isPullRequest && payload.action === "closed"

      let isReviewSubmitted = isReview && payload.action === "submitted"

      if (isOpened || isPrReopened || isReviewRequested || isReadyForReview) {
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
          console.log("Changes are request: changing task status")
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenChangesRequested,
            branchName: ref
          });
        }
      } else if (isConvertedToDraft) {
        const {
          pull_request: {
            head: { ref }
          }
        } = payload as Webhooks.EventPayloads.WebhookPayloadPullRequest;
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenChangesRequested,
            branchName: ref
          });
      } else if (isPrClosed) {
        const {
          pull_request: {
            merged,
            head: { ref }
          }
        } = payload as Webhooks.EventPayloads.WebhookPayloadPullRequest;
        if (merged && parsedInput.columnToMoveToWhenMerged) {
          console.log("Changes are merged: changing task status")
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenMerged,
            branchName: ref
          });
        } else {
          console.log("Changes are not merged: changing task status accordingly")
          const {
            pull_request: {
              head: { ref }
            }
          } = payload as Webhooks.EventPayloads.WebhookPayloadPullRequest;
          await handleTransitionIssue({
            ...parsedInput,
            colName: parsedInput.columnToMoveToWhenChangesRequested,
            branchName: ref
          });
        }
      } else {
        let errorMessage = `Unsupported github event: ${eventName}, action: ${payload.action}. Are you sure your configuration is correct?`
        console.log(errorMessage)
        core.setFailed(errorMessage)
      }
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
