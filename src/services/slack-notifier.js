import axios from 'axios';
import config from '../config';

export default {
  notifyNewComment: async ({
    location,
    content,
    postedBy,
    contactInfo,
  }) => {
    const { slackWebhookUrl } = config;

    if (!slackWebhookUrl) {
      return Promise.resolve();
    }

    let text = `New comment for *${location.Organization.name}*: "_${content}_"`;

    const posterInfo = [];
    if (postedBy) {
      posterInfo.push(`by _${postedBy}_`);
    }
    if (contactInfo) {
      posterInfo.push(`email/phone: ${contactInfo}`);
    }
    if (posterInfo.length) {
      text += ` (${posterInfo.join(', ')})`;
    }

    return axios.post(config.slackWebhookUrl, { text });
  },
};
