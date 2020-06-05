import core from '@actions/core';
import notify, { JobStatus } from './notify';

async function run() {
  try {
    const url = process.env.SLACK_WEBHOOK_URL;

    if (!url) {
      throw new Error('Please set [SLACK_WEBHOOK_URL] environment variable');
    }

    const jobStatus = core.getInput('status', { required: true });

    if (!['success', 'failure', 'cancelled'].includes(jobStatus)) {
      throw new Error('Unknown job status passed in.');
    }

    await notify(jobStatus as JobStatus, url);
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

run();