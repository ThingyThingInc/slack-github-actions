import got from 'got';
import core from '@actions/core';
import { context } from '@actions/github';
import { getFailedJob } from './multiple-jobs';

export type JobStatus = 'success' | 'failure' | 'cancelled';

/**
 * Returns parameters depending on the status of the workflow
 */
const jobParameters = (status: JobStatus) => {
  return {
    success: {
      color: 'good',
      text: '*Success*',
    },
    failure: {
      color: 'danger',
      text: '*Failed*',
    },
    cancelled: {
      color: 'warning',
      text: '*Cancelled*',
    },
  }[status];
};

/**
 * Returns message for slack based on event type
 */
const getMessage = async (statusString: string) => {
  const eventName = context.eventName;

  const job = await getFailedJob();

  // const runUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${job.id}`;
  const runUrl = job.url;
  // const commitId = context.sha.substring(0, 7);

  switch (eventName) {
    case 'pull_request': {
      const pr = {
        title: context.payload.pull_request?.title,
        number: context.payload.pull_request?.number,
        url: context.payload.pull_request?.html_url,
      };

      // const compareUrl = `${context.payload.repository?.html_url}/compare/${context.payload.pull_request?.head.ref}`;

      // prettier-ignore
      return ` ${statusString}: PR <${pr.url}| #${pr.number} ${pr.title}> during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;
    }

    case 'release': {
      const release = {
        title: context.payload.release.name || context.payload.release.tag_name,
        url: context.payload.release.html_url,
        commit: `${context.payload.repository?.html_url}/commit/${context.sha}`,
      };
      // prettier-ignore
      return `${statusString}: Release <${release.url}|${release.title}> during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;
    }

    case 'push': {
      if (context.payload.ref.includes('tags')) {
        const pre = 'refs/tags/';
        const title = context.payload.ref.substring(pre.length);

        const tag = {
          title,
          commit: context.payload.compare,
          url: `${context.payload.repository?.html_url}/releases/tag/${title}`,
        };

        // prettier-ignore
        return `${statusString}: Tag <${tag.url}|${tag.title}> during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;
      }

      const commitMessage = context.payload.head_commit.message;
      const headCommit = {
        title: commitMessage.includes('\n')
          ? commitMessage.substring(0, commitMessage.indexOf('\n'))
          : commitMessage,
        url: context.payload.head_commit.url,
      };

      // Normal commit push
      return `${statusString}: <${headCommit.url}|${headCommit.title}> during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;

      // {commit message} {status} during {job} ({workflow})
    }

    case 'schedule': {
      return `Scheduled Workflow <${runUrl}|${context.workflow}>`;
    }

    case 'create': {
      if (context.payload.ref_type !== 'branch') {
        return null;
      }

      const pre = 'refs/heads/';
      const branchName = context.ref.substring(pre.length);
      const branchUrl = `${context.payload.repository.html_url}/tree/${branchName}`;

      return `${statusString}: Branch <${branchUrl}|${branchName}> creation during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;
    }

    case 'delete': {
      if (context.payload.ref_type !== 'branch') {
        return null;
      }

      const branchName = context.payload.ref;
      return `${statusString}: Branch \`${branchName}\` deletion during <${job.url}|${job.name}> _<${runUrl}|${context.workflow}>_`;
    }

    default:
      return null;
  }
};

/**
 * Sends message via slack
 */
const notify = async (status: JobStatus, url: string) => {
  const sender = context.payload.sender;

  const message = await getMessage(jobParameters(status).text);
  core.debug(JSON.stringify(context));

  if (!message) {
    console.log(`We don't support the [${context.eventName}] event yet.`);
    return;
  }

  const attachment = {
    author_name: sender?.login,
    author_link: sender?.html_url,
    author_icon: sender?.avatar_url,
    color: jobParameters(status).color,
    footer: `<https://github.com/${process.env.GITHUB_REPOSITORY}|${process.env.GITHUB_REPOSITORY}>`,
    footer_icon: 'https://github.githubassets.com/favicon.ico',
    mrkdwn_in: ['text'],
    ts: new Date(context.payload.repository?.pushed_at).getTime().toString(),
    text: message,
  };

  if (context.eventName === 'schedule') {
    // Schedule event doesn't have a commit so we use the current time
    attachment.ts = new Date().getTime().toString();
  }

  const payload = {
    attachments: [attachment],
  };

  await got.post(url, {
    body: JSON.stringify(payload),
  });
};

export default notify;
