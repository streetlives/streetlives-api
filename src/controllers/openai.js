/* eslint-disable max-len, no-console */

import OpenAI from 'openai';
import * as nlLimiter from './nl-limiter';

const openai = new OpenAI();

const commentsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      comment: {
        type: 'string',
      },
      sentiment: {
        type: 'string',
        enum: [
          'Strongly Positive',
          'Positive',
          'Mixed',
          'Negative',
          'Strongly Negative',
        ],
      },
      informativeness_score: {
        type: 'integer',
      },
      key_positive_sentiment_takeaways: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      key_negative_sentiment_takeaways: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    required: [
      'id',
      'comment',
      'sentiment',
      'informativeness_score',
      'key_positive_sentiment_takeaways',
      'key_negative_sentiment_takeaways',
    ],
    additionalProperties: false,
  },
};

const responseJsonSchema = {
  type: 'json_schema',
  json_schema: {
    strict: true,
    name: 'ReviewCommentKeyTakeaways',
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        top_positive_comments: commentsSchema,
        top_negative_comments: commentsSchema,
        top_mixed_comments: commentsSchema,
      },
      required: [
        'top_positive_comments',
        'top_negative_comments',
        'top_mixed_comments',
      ],
      additionalProperties: false,
    },
  },
};

const defaultPrompt = `
Find the top 5 comments with NEGATIVE, the top 5 comments with POSITIVE sentiment and the top 5 comments with MIXED from the following list of comments that are the most informative and have the strongest sentiment.

For each comment, identify:

* Sentiment: Classify as Strongly Positive, Strongly Negative, Neutral, or Mixed.
* Informativeness Score (1-5): Rate how detailed and useful the comment is, with 5 being highly informative (e.g., detailed reasons, pros/cons, comparisons) and 1 being vague or generic.
* Comment: Reproduce the comment text verbatim.
* Id: Reproduce the id of the comment verbatim.
* Key Positive Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has positive sentiment and is around five words long. Don't excerpt the entire comment.
* Key Negative Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has negative sentiment and is around five words long. Don't excerpt the entire comment.

Be sure NOT to modify the original id and comment text in the output.

Here are example outputs showing some example comments and takeaways. 

Example Inputs:

\`\`\`json
[
    {
        "comment": "They actively keep the site safe and don't allow violence or weapons on site",
        "id": 1
    },
    {
        "comment": "I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe",
        "id": 2
    },
    {
        "comment": "The area was clean, the floors looked very clean, the blue seats looked clean as well. But the beige seating area looks like it is due for a deep clean",
        "id": 3
    }
]
\`\`\`

Example Output as JSON:

\`\`\`json
{
  "top_positive_comments": [
    {
      "id": 1,
      "comment": "They actively keep the site safe and don't allow violence or weapons on site",
      "sentiment": "Strongly Positive",
      "informativeness_score": 3,
      "key_positive_sentiment_takeaways": [
        "They actively keep the site safe"
      ],
      "key_negative_sentiment_takeaways": []
    }
  ],
  "top_negative_comments": [
    {
      "id": 2,
      "comment": "I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe",
      "sentiment": "Strongly Negative",
      "informativeness_score": 5,
      "key_positive_sentiment_takeaways": [
        "I felt safe"
      ],
      "key_negative_sentiment_takeaways": [
        "I was pursued by another participant"
      ]
    }
  ],
  "top_mixed_comments": [
    {
      "id": 3,
      "commment": "The area was clean, the floors looked very clean, the blue seats looked clean as well. But the beige seating area looks like it is due for a deep clean",
      "sentiment": "Mixed",
      "informativeness_score": 5,
      "key_positive_entiment_takeaways": [
        "area was clean"
      ],
      "key_negative_sentiment_takeaways": [
        "looks like it is due for a deep clean"
      ]
    }
  ]
}
\`\`\`

Here are more examples of extracting negative and positive sentiments from comments. DO NOT include the example inputs in the response.

Example Inputs:

\`\`\`json
[
    {
        "id": 0,
        "comment": "lgbtq friendly, group activities and events, entertainment for clients like video games and television, giftcards and parties for"
    },
    {
        "id": 1,
        "comment": "everything is cleaned but they need more staff to maintain the cleaniness"
    },
    {
        "id": 2,
        "comment": "helped with my housing journey and even provided furniture giftcards after assistance with housing. received medical care and connection to OBGYN"
    },
    {
        "id": 3,
        "comment": "i feel safe here but sometimes since it\u2019s an LGBTQ safe space they are targeted. the person came back trying to kick down the door and harm people. luckily however the door was secured by a code and it was sturdy."
    },
    {
        "id": 4,
        "comment": "The staff are nice and respectful of pronouns"
    },
    {
        "id": 5,
        "comment": "The place is a little old and sometimes unsanitary bathrooms."
    },
    {
        "id": 6,
        "comment": "The thing they need to work on is their housing opportunities long-term and curfew exceptions."
    },
    {
        "id": 7,
        "comment": "area is very busy and can be sketchy. It is better to be there during the day."
    },
    {
        "id": 8,
        "comment": "it was pretty messy, sticky tables and floors, but by the time I was finished the place was clean again"
    },
    {
        "id": 9,
        "comment": "The mail services were helpful. I It usually is over flowing with items. Today there wasn\u2019t much but business branded collared shirts for NSC. I also asked for a bra, and they did not have any other sizes outside of D."
    },
    {
        "id": 10,
        "comment": "Usually is can be rowdy(, and )front window and door were beat up pretty bad. I know they often replace those things but it doesn\u2019t last very long."
    },
    {
        "id": 11,
        "comment": "staff is very inclusive. A large portion of the staff is queer themselves. bathrooms are gender neutral."
    },
    {
        "id": 12,
        "comment": "Very welcoming"
    },
    {
        "id": 13,
        "comment": "Very responsive and helpful"
    },
    {
        "id": 14,
        "comment": "They help get me more hormones"
    },
    {
        "id": 15,
        "comment": "Very friendly"
    },
    {
        "id": 16,
        "comment": "Very knowledgeable"
    },
    {
        "id": 17,
        "comment": "look forward to seeing me."
    },
    {
        "id": 18,
        "comment": "it isn't always as clean as it could be, even despite the drop-in staff's efforts to maintain some level of cleanliness"
    },
    {
        "id": 19,
        "comment": "stuff still happens."
    },
    {
        "id": 20,
        "comment": "They respect my pronouns and called me by name consistently even before my name had been officially changed."
    },
    {
        "id": 21,
        "comment": "fairly welcoming and helpful with their services and quick services"
    },
    {
        "id": 22,
        "comment": "wasn't dirty and looked fairly well kept"
    },
    {
        "id": 23,
        "comment": "Allow( me )to get food and helped in that department"
    },
    {
        "id": 24,
        "comment": "The staff were nice and there was security, also was fairly empty"
    },
    {
        "id": 25,
        "comment": "There is a lot of animosity towards anyone who isn't sure"
    },
    {
        "id": 26,
        "comment": "Constant dirt and grossness"
    },
    {
        "id": 27,
        "comment": "Still homeless"
    },
    {
        "id": 28,
        "comment": "I had my life threatened in one of the shelters they refused to help with an ongoing investigation with someone from there pepper spraying and assaulting a disabled person"
    },
    {
        "id": 29,
        "comment": "If you're queer, you're good"
    },
    {
        "id": 30,
        "comment": "not ADA compliant and has so many internal issues."
    },
    {
        "id": 31,
        "comment": "It was ok"
    },
    {
        "id": 32,
        "comment": "They helped me with benefits"
    },
    {
        "id": 33,
        "comment": "unsanitary"
    },
    {
        "id": 34,
        "comment": "Respectful"
    },
    {
        "id": 35,
        "comment": "resourceful"
    },
    {
        "id": 36,
        "comment": "respect my sexuality and preferences"
    },
    {
        "id": 37,
        "comment": "case manager was cold"
    },
    {
        "id": 38,
        "comment": "They failed to mention that I am ineligible and made me go through the process for no reason"
    },
    {
        "id": 39,
        "comment": "Not responsive"
    },
    {
        "id": 40,
        "comment": "guards are welcoming the staff who did the tour very welcoming and nice to me !"
    },
    {
        "id": 41,
        "comment": "Didn\u2019t see garbage or dirt or anything unorganized"
    },
    {
        "id": 42,
        "comment": "was still able to come receive( work )assistance"
    },
    {
        "id": 43,
        "comment": "Security, no police allowed inside"
    },
    {
        "id": 44,
        "comment": "lgbtq activities"
    },
    {
        "id": 45,
        "comment": "They usually are on it when I\u2019ve been around."
    },
    {
        "id": 46,
        "comment": "There\u2019s a bunch of youth sometimes gathered up in one place"
    },
    {
        "id": 47,
        "comment": "They are helpful the wait period sucksin regards to"
    },
    {
        "id": 48,
        "comment": "I felt safe( because )I haven\u2019t seen any discriminationor lack of celebrations"
    },
    {
        "id": 49,
        "comment": "Thank you"
    },
    {
        "id": 50,
        "comment": "don't have a lot of security"
    },
    {
        "id": 51,
        "comment": "The staff are always so helpful and greet you most of the time :"
    },
    {
        "id": 52,
        "comment": "well sanitized."
    },
    {
        "id": 53,
        "comment": "The services cater to LGBT youth but I was able to get some stuff like food, clothes and house products"
    },
    {
        "id": 54,
        "comment": "the place is safe. The area is( also )nice"
    },
    {
        "id": 55,
        "comment": "The bathrooms are queer friendly. Sometimes they need maintenance."
    },
    {
        "id": 56,
        "comment": "very welcoming and nice place to thrive as an LGBTQ youth."
    },
    {
        "id": 57,
        "comment": "I didn\u2019t feel truly represented by staff even down to having my voice heard, I had to mainly do things myself in order for helped me build myself upto become an advocate, unhelpful in the sense that this place putting their own needs first."
    },
    {
        "id": 58,
        "comment": "I feel safe because I helped create that space to be safe as of today, unsafe because I was unfortunately a target for a lot of staff who\u2019ve tried to pick and bully me because I was advocating for the youth."
    },
    {
        "id": 59,
        "comment": "queer friendly because of the bathrooms, they do have certain groups for trans and non-binary people. However, every letter needs to be represented meaning lesbians and pansexuals need more visibility too."
    },
    {
        "id": 60,
        "comment": "very friendly and long history with services, lgbtq safe space"
    },
    {
        "id": 61,
        "comment": "bathrooms are clean but i needs more cleaning"
    },
    {
        "id": 62,
        "comment": "services are useful after i"
    },
    {
        "id": 63,
        "comment": "disclosed location but in very busy street. multiple doors to get through before you can enter"
    },
    {
        "id": 64,
        "comment": "queer friendly and inclusive"
    },
    {
        "id": 65,
        "comment": "The area was clean, the floors looked very clean, the blue seats looked clean as well. beige seating area( looks like it )is due for a deep clean."
    },
    {
        "id": 66,
        "comment": "I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe."
    },
    {
        "id": 67,
        "comment": "There is a gender neutral bathroom."
    },
    {
        "id": 68,
        "comment": "they love what they do"
    },
    {
        "id": 69,
        "comment": "They keep up with the standards of Covid 19"
    },
    {
        "id": 70,
        "comment": "They was there for me when I needed them"
    },
    {
        "id": 71,
        "comment": "made sure all needs was met"
    },
    {
        "id": 72,
        "comment": "Some people can be bias towards"
    },
    {
        "id": 73,
        "comment": "They're clean"
    },
    {
        "id": 74,
        "comment": "don't allow violence or weapons on site."
    },
    {
        "id": 75,
        "comment": "run by LGBT people"
    },
    {
        "id": 76,
        "comment": "Always was open and kept promise's"
    },
    {
        "id": 77,
        "comment": "The bathroom was gender neutral. I was not asked my pronouns."
    },
    {
        "id": 78,
        "comment": "This center is clean, and friendly.The site can work on its confidentiality I shouldn\u2019t have heard so much of another The entry way can also be improved. They already have a two door system so the first set of doors can house a front desk."
    },
    {
        "id": 79,
        "comment": "Everything was clean. The surfaces and the general area. the TV area was very nice."
    },
    {
        "id": 80,
        "comment": "waiting 45min to speak with the housing navigator, I got my application I haven\u2019t been able to reach the housing navigator even after emailing and calling multiple times."
    },
    {
        "id": 81,
        "comment": "It felt calm in the space"
    },
    {
        "id": 82,
        "comment": "The bathrooms were gender neutral. And I was asked my pronouns"
    },
    {
        "id": 83,
        "comment": "Very good"
    },
    {
        "id": 84,
        "comment": "Good"
    },
    {
        "id": 85,
        "comment": "They were attentive to my needs"
    },
    {
        "id": 86,
        "comment": "They are unjudgemental and security is here"
    },
    {
        "id": 87,
        "comment": "They are accepting"
    },
    {
        "id": 88,
        "comment": "made coversation and gave snacks"
    },
    {
        "id": 89,
        "comment": "Was spotless"
    },
    {
        "id": 90,
        "comment": "Very informative"
    },
    {
        "id": 91,
        "comment": "People were friendly"
    },
    {
        "id": 92,
        "comment": "No judgements were made"
    },
    {
        "id": 93,
        "comment": "They\u2019re compassionate"
    },
    {
        "id": 94,
        "comment": "Almost neat"
    },
    {
        "id": 95,
        "comment": "They\u2019re understanding"
    },
    {
        "id": 96,
        "comment": "It\u2019s a good place"
    },
    {
        "id": 97,
        "comment": "I see all kind of people there"
    },
    {
        "id": 98,
        "comment": "felt comfortable talking to everyone"
    },
    {
        "id": 99,
        "comment": "Everyone cleans up after themselves and shared surfaces are wiped down"
    },
    {
        "id": 100,
        "comment": "Found community, clothes, work"
    },
    {
        "id": 101,
        "comment": "Group ground rules enforced"
    },
    {
        "id": 102,
        "comment": "centered around queer youth"
    },
    {
        "id": 103,
        "comment": "disrespectful and discriminating"
    },
    {
        "id": 104,
        "comment": "floors and everything are always clean"
    },
    {
        "id": 105,
        "comment": "They neglect me"
    },
    {
        "id": 106,
        "comment": "They use pronouns and respect people who use them"
    },
    {
        "id": 107,
        "comment": "I feel safe and respected in their locations. I\u2019ve received fantastic services at CL."
    },
    {
        "id": 108,
        "comment": "They take the cleanliness( of their environment )serious."
    },
    {
        "id": 109,
        "comment": "They\u2019ve helped with all of my physical and mental care needs, and gender transition for the past 3 years. They\u2019re consistent and communicate well"
    },
    {
        "id": 110,
        "comment": "Safety is important to them"
    },
    {
        "id": 111,
        "comment": "their services are for LGBTQIA+ clients."
    },
    {
        "id": 112,
        "comment": "Because my friend was in the front"
    },
    {
        "id": 113,
        "comment": "Because I went to the bathroom and saw for my self"
    },
    {
        "id": 114,
        "comment": "Because of the safety aquirements"
    },
    {
        "id": 115,
        "comment": "it\u2019s not streeful"
    },
    {
        "id": 116,
        "comment": "Their Sanitation Is Excellent"
    },
    {
        "id": 117,
        "comment": "Give You Everything You Need"
    },
    {
        "id": 118,
        "comment": "Security( In New Alternative )Is Good"
    },
    {
        "id": 119,
        "comment": "Have Activity\u2019s For Queer Folks"
    },
    {
        "id": 120,
        "comment": "very nice and sweet"
    },
    {
        "id": 121,
        "comment": "help every time I come here"
    }
]
\`\`\`

Example Output JSON:

\`\`\`json
{
    "top_positive_comments": [
        {
            "id": 0,
            "comment": "lgbtq friendly, group activities and events, entertainment for clients like video games and television, giftcards and parties for",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "lgbtq friendly",
                "entertainment for clients"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 2,
            "comment": "helped with my housing journey and even provided furniture giftcards after assistance with housing. received medical care and connection to OBGYN",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "helped with my housing journey",
                "even provided furniture giftcards",
                "received medical care and connection to OBGYN"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 4,
            "comment": "The staff are nice and respectful of pronouns",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "staff are nice and respectful of pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 11,
            "comment": "staff is very inclusive. A large portion of the staff is queer themselves. bathrooms are gender neutral.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "staff is very inclusive",
                "bathrooms are gender neutral"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 12,
            "comment": "Very welcoming",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very welcoming"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 13,
            "comment": "Very responsive and helpful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very responsive and helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 14,
            "comment": "They help get me more hormones",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They help get me more hormones"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 15,
            "comment": "Very friendly",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 16,
            "comment": "Very knowledgeable",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very knowledgeable"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 17,
            "comment": "look forward to seeing me.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "look forward to seeing me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 20,
            "comment": "They respect my pronouns and called me by name consistently even before my name had been officially changed.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They respect my pronouns and called me by name"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 21,
            "comment": "fairly welcoming and helpful with their services and quick services",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "fairly welcoming and helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 22,
            "comment": "wasn't dirty and looked fairly well kept",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "wasn't dirty",
                "fairly well kept"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 23,
            "comment": "Allow( me )to get food and helped in that department",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Allow( me )to get food and helped"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 24,
            "comment": "The staff were nice and there was security, also was fairly empty",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The staff were nice and there was security, also was fairly empty"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 29,
            "comment": "If you're queer, you're good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "If you're queer, you're good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 32,
            "comment": "They helped me with benefits",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They helped me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 33,
            "comment": "unsanitary",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "unsanitary"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 34,
            "comment": "Respectful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Respectful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 35,
            "comment": "resourceful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "resourceful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 36,
            "comment": "respect my sexuality and preferences",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "respect my sexuality and preferences"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 40,
            "comment": "guards are welcoming the staff who did the tour very welcoming and nice to me !",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "guards are welcoming",
                "very welcoming and nice to me !"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 41,
            "comment": "Didn\u2019t see garbage or dirt or anything unorganized",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Didn\u2019t see garbage or dirt"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 42,
            "comment": "was still able to come receive( work )assistance",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "was still able to come receive( work )assistance"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 43,
            "comment": "Security, no police allowed inside",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Security, no police allowed inside"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 44,
            "comment": "lgbtq activities",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "lgbtq activities"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 45,
            "comment": "They usually are on it when I\u2019ve been around.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They usually are on it"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 48,
            "comment": "I felt safe( because )I haven\u2019t seen any discriminationor lack of celebrations",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "I felt safe( because )I haven\u2019t seen any discrimination"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 49,
            "comment": "Thank you",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Thank you"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 51,
            "comment": "The staff are always so helpful and greet you most of the time :",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The staff are always so helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 52,
            "comment": "well sanitized.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "well sanitized"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 53,
            "comment": "The services cater to LGBT youth but I was able to get some stuff like food, clothes and house products",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The services cater to LGBT youth",
                "I was able to get some stuff"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 54,
            "comment": "the place is safe. The area is( also )nice",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "the place is safe. The area is( also )nice"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 56,
            "comment": "very welcoming and nice place to thrive as an LGBTQ youth.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very welcoming and nice place to thrive as an LGBTQ youth"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 60,
            "comment": "very friendly and long history with services, lgbtq safe space",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 62,
            "comment": "services are useful after i",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "services are useful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 64,
            "comment": "queer friendly and inclusive",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "queer friendly and inclusive"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 67,
            "comment": "There is a gender neutral bathroom.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "There is a gender neutral bathroom"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 68,
            "comment": "they love what they do",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "they love what they do"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 69,
            "comment": "They keep up with the standards of Covid 19",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They keep up with the standards"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 70,
            "comment": "They was there for me when I needed them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They was there for me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 71,
            "comment": "made sure all needs was met",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "made sure all needs was met"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 73,
            "comment": "They're clean",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They're clean"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 74,
            "comment": "don't allow violence or weapons on site.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "don't allow violence or weapons on site."
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 75,
            "comment": "run by LGBT people",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "run by LGBT people"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 76,
            "comment": "Always was open and kept promise's",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Always was open"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 79,
            "comment": "Everything was clean. The surfaces and the general area. the TV area was very nice.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Everything was clean",
                "the TV area was very nice"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 81,
            "comment": "It felt calm in the space",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "It felt calm in the space"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 82,
            "comment": "The bathrooms were gender neutral. And I was asked my pronouns",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The bathrooms were gender neutral. And I was asked my pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 83,
            "comment": "Very good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 84,
            "comment": "Good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 85,
            "comment": "They were attentive to my needs",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They were attentive to my needs"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 86,
            "comment": "They are unjudgemental and security is here",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They are unjudgemental and security is here"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 87,
            "comment": "They are accepting",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They are accepting"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 88,
            "comment": "made coversation and gave snacks",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "made coversation and gave snacks"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 89,
            "comment": "Was spotless",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Was spotless"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 90,
            "comment": "Very informative",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very informative"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 91,
            "comment": "People were friendly",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "People were friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 92,
            "comment": "No judgements were made",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "No judgements were made"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 93,
            "comment": "They\u2019re compassionate",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They\u2019re compassionate"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 95,
            "comment": "They\u2019re understanding",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They\u2019re understanding"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 96,
            "comment": "It\u2019s a good place",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "It\u2019s a good place"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 98,
            "comment": "felt comfortable talking to everyone",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "felt comfortable talking"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 99,
            "comment": "Everyone cleans up after themselves and shared surfaces are wiped down",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Everyone cleans up",
                "shared surfaces are wiped down"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 100,
            "comment": "Found community, clothes, work",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Found community, clothes, work"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 101,
            "comment": "Group ground rules enforced",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Group ground rules enforced"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 102,
            "comment": "centered around queer youth",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "centered around queer youth"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 104,
            "comment": "floors and everything are always clean",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "floors and everything are always clean"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 106,
            "comment": "They use pronouns and respect people who use them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They use pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 107,
            "comment": "I feel safe and respected in their locations. I\u2019ve received fantastic services at CL.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "I feel safe and respected",
                "I\u2019ve received fantastic services"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 108,
            "comment": "They take the cleanliness( of their environment )serious.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They take the cleanliness( of their environment )serious"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 109,
            "comment": "They\u2019ve helped with all of my physical and mental care needs, and gender transition for the past 3 years. They\u2019re consistent and communicate well",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They\u2019ve helped with all of my physical and mental care needs",
                "They\u2019re consistent and communicate well"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 110,
            "comment": "Safety is important to them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Safety is important to them"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 111,
            "comment": "their services are for LGBTQIA+ clients.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "their services are for LGBTQIA+"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 115,
            "comment": "it\u2019s not streeful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "it\u2019s not streeful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 116,
            "comment": "Their Sanitation Is Excellent",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Their Sanitation Is Excellent"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 117,
            "comment": "Give You Everything You Need",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Give You Everything You Need"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 118,
            "comment": "Security( In New Alternative )Is Good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Security( In New Alternative )Is Good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 119,
            "comment": "Have Activity\u2019s For Queer Folks",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Have Activity\u2019s For Queer"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 120,
            "comment": "very nice and sweet",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very nice and sweet"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "id": 121,
            "comment": "help every time I come here",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "help every time I come"
            ],
            "key_negative_sentiment_takeaways": []
        }
    ],
    "top_negative_comments": [
        {
            "id": 5,
            "comment": "The place is a little old and sometimes unsanitary bathrooms.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "place is a little old",
                "sometimes unsanitary"
            ]
        },
        {
            "id": 6,
            "comment": "The thing they need to work on is their housing opportunities long-term and curfew exceptions.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "The thing they need to work on is their housing opportunities",
                "and curfew exceptions"
            ]
        },
        {
            "id": 7,
            "comment": "area is very busy and can be sketchy. It is better to be there during the day.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "can be sketchy"
            ]
        },
        {
            "id": 10,
            "comment": "Usually is can be rowdy(, and )front window and door were beat up pretty bad. I know they often replace those things but it doesn\u2019t last very long.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Usually is can be rowdy(, and )front window and door were beat up pretty bad"
            ]
        },
        {
            "id": 18,
            "comment": "it isn't always as clean as it could be, even despite the drop-in staff's efforts to maintain some level of cleanliness",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "it isn't always as clean"
            ]
        },
        {
            "id": 19,
            "comment": "stuff still happens.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "stuff still happens"
            ]
        },
        {
            "id": 25,
            "comment": "There is a lot of animosity towards anyone who isn't sure",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "There is a lot of animosity"
            ]
        },
        {
            "id": 26,
            "comment": "Constant dirt and grossness",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Constant dirt and grossness"
            ]
        },
        {
            "id": 27,
            "comment": "Still homeless",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Still homeless"
            ]
        },
        {
            "id": 28,
            "comment": "I had my life threatened in one of the shelters they refused to help with an ongoing investigation with someone from there pepper spraying and assaulting a disabled person",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "I had my life threatened",
                "they refused to help",
                "pepper spraying and assaulting a disabled person"
            ]
        },
        {
            "id": 30,
            "comment": "not ADA compliant and has so many internal issues.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "not ADA compliant",
                "has so many internal issues"
            ]
        },
        {
            "id": 37,
            "comment": "case manager was cold",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "case manager was cold"
            ]
        },
        {
            "id": 38,
            "comment": "They failed to mention that I am ineligible and made me go through the process for no reason",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "They failed to mention",
                "made me go through the process for no reason"
            ]
        },
        {
            "id": 39,
            "comment": "Not responsive",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Not responsive"
            ]
        },
        {
            "id": 50,
            "comment": "don't have a lot of security",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "don't have a lot of security"
            ]
        },
        {
            "id": 58,
            "comment": "I feel safe because I helped create that space to be safe as of today, unsafe because I was unfortunately a target for a lot of staff who\u2019ve tried to pick and bully me because I was advocating for the youth.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "staff who\u2019ve tried to pick and bully"
            ]
        },
        {
            "id": 63,
            "comment": "disclosed location but in very busy street. multiple doors to get through before you can enter",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "multiple doors to get through"
            ]
        },
        {
            "id": 72,
            "comment": "Some people can be bias towards",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Some people can be bias"
            ]
        },
        {
            "id": 80,
            "comment": "waiting 45min to speak with the housing navigator, I got my application I haven\u2019t been able to reach the housing navigator even after emailing and calling multiple times.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "waiting 45min",
                "I haven\u2019t been able to reach the housing navigator"
            ]
        },
        {
            "id": 103,
            "comment": "disrespectful and discriminating",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "disrespectful and discriminating"
            ]
        },
        {
            "id": 105,
            "comment": "They neglect me",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "They neglect me"
            ]
        }
    ],
    "top_mixed_comments": [
        {
            "id": 1,
            "comment": "everything is cleaned but they need more staff to maintain the cleaniness",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "everything is cleaned"
            ],
            "key_negative_sentiment_takeaways": [
                "need more staff to maintain the cleaniness"
            ]
        },
        {
            "id": 3,
            "comment": "i feel safe here but sometimes since it\u2019s an LGBTQ safe space they are targeted. the person came back trying to kick down the door and harm people. luckily however the door was secured by a code and it was sturdy.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "i feel safe here"
            ],
            "key_negative_sentiment_takeaways": [
                "the person came back trying to kick down the door and harm people"
            ]
        },
        {
            "id": 8,
            "comment": "it was pretty messy, sticky tables and floors, but by the time I was finished the place was clean again",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "the place was clean again"
            ],
            "key_negative_sentiment_takeaways": [
                "it was pretty messy"
            ]
        },
        {
            "id": 9,
            "comment": "The mail services were helpful. I It usually is over flowing with items. Today there wasn\u2019t much but business branded collared shirts for NSC. I also asked for a bra, and they did not have any other sizes outside of D.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The mail services were helpful",
                "It usually is over flowing with items."
            ],
            "key_negative_sentiment_takeaways": [
                "they did not have any other sizes"
            ]
        },
        {
            "id": 47,
            "comment": "They are helpful the wait period sucksin regards to",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They are helpful"
            ],
            "key_negative_sentiment_takeaways": [
                "wait period sucks"
            ]
        },
        {
            "id": 55,
            "comment": "The bathrooms are queer friendly. Sometimes they need maintenance.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The bathrooms are queer friendly"
            ],
            "key_negative_sentiment_takeaways": [
                "Sometimes they need maintenance"
            ]
        },
        {
            "id": 57,
            "comment": "I didn\u2019t feel truly represented by staff even down to having my voice heard, I had to mainly do things myself in order for helped me build myself upto become an advocate, unhelpful in the sense that this place putting their own needs first.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "helped me build myself up"
            ],
            "key_negative_sentiment_takeaways": [
                "I didn\u2019t feel truly represented",
                "I had to mainly do things myself",
                "putting their own needs first"
            ]
        },
        {
            "id": 59,
            "comment": "queer friendly because of the bathrooms, they do have certain groups for trans and non-binary people. However, every letter needs to be represented meaning lesbians and pansexuals need more visibility too.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "queer friendly"
            ],
            "key_negative_sentiment_takeaways": [
                "lesbians and pansexuals need more visibility"
            ]
        },
        {
            "id": 61,
            "comment": "bathrooms are clean but i needs more cleaning",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "bathrooms are clean"
            ],
            "key_negative_sentiment_takeaways": [
                "needs more cleaning"
            ]
        },
        {
            "id": 65,
            "comment": "The area was clean, the floors looked very clean, the blue seats looked clean as well. beige seating area( looks like it )is due for a deep clean.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The area was clean"
            ],
            "key_negative_sentiment_takeaways": [
                "beige seating area( looks like it )is due for a deep clean"
            ]
        },
        {
            "id": 66,
            "comment": "I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "the staff told them to stop",
                "I felt safe."
            ],
            "key_negative_sentiment_takeaways": [
                "I was pursued by another participant"
            ]
        },
        {
            "id": 77,
            "comment": "The bathroom was gender neutral. I was not asked my pronouns.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The bathroom was gender neutral"
            ],
            "key_negative_sentiment_takeaways": [
                "I was not asked my pronouns."
            ]
        },
        {
            "id": 78,
            "comment": "This center is clean, and friendly.The site can work on its confidentiality I shouldn\u2019t have heard so much of another The entry way can also be improved. They already have a two door system so the first set of doors can house a front desk.",
            "sentiment": "Mixed",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "This center is clean, and friendly."
            ],
            "key_negative_sentiment_takeaways": [
                "The site can work on its confidentiality",
                "The entry way can also be improved"
            ]
        }
    ]
}
\`\`\`



Please analyze the following user comments:

\`\`\`
`;

const renderPrompt = comments => `\`\`\`json
    ${JSON.stringify(comments, null, 2)}
  \`\`\``;

function normalizeComment(comment) {
  try {
    const parsedComment = JSON.parse(comment.content);
    const toReturn = [];
    for (const key of ['whatWentWell', 'whatCouldBeImproved']) {
      if (key in parsedComment && parsedComment[key]) {
        toReturn.push({
          id: `${comment.id}#${key}`,
          comment: parsedComment[key],
        });
      }
    }
    return toReturn;
  } catch (e) {
    // instead we have a string comment
    return [
      {
        id: comment.id,
        comment: comment.content,
      },
    ];
  }
}

function filterModelOutput(commentLookupMap, excerpt) {
  return excerpt.id in commentLookupMap && commentLookupMap[excerpt.id];
}

function checkExistenceOfExcerptsInOriginalComments(commentLookupMap, excerpt) {
  return {
    ...excerpt,
    // replace the comment from the LLM with the original comment
    comment: commentLookupMap[excerpt.id],
    // validate the excerpts
    key_negative_sentiment_takeaways:
      excerpt.key_negative_sentiment_takeaways.filter(s =>
        commentLookupMap[excerpt.id].includes(s)),
    key_positive_sentiment_takeaways:
      excerpt.key_positive_sentiment_takeaways.filter(s =>
        commentLookupMap[excerpt.id].includes(s)),
  };
}

function filterOutCommentsWithoutExcerpts(excerpt) {
  return (
    excerpt.key_negative_sentiment_takeaways.length ||
    excerpt.key_positive_sentiment_takeaways.length
  );
}

const getCommentsHighlights = async (comments) => {
  const commentContents = comments.flatMap(normalizeComment);
  // console.log('commentContents', JSON.stringify(commentContents, null, 2));
  const commentLookupMap = Object.fromEntries(commentContents.map(({ id, comment }) => [id, comment]));
  try {
    const tic = new Date();
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: "system", content: defaultPrompt },
        { role: "user", content: renderPrompt(commentContents) },
      ],
      response_format: responseJsonSchema,
    });
    console.log('completion took', (new Date()) - tic, 'ms');

    // use the new id property to refer back to the original comment and lookup the comment text verbatim
    // parse the results back out
    const parsedResponse = JSON.parse(completion.choices[0].message.content);
    console.log('parsedResponse', JSON.stringify(parsedResponse, null, 2));
    const validatedOutput = Object.fromEntries(Object.entries(parsedResponse).map(([k, v]) => [
      k,
      v
        .filter(filterModelOutput.bind(null, commentLookupMap))
        .map(checkExistenceOfExcerptsInOriginalComments.bind(
          null,
          commentLookupMap,
        ))
        .filter(filterOutCommentsWithoutExcerpts),
    ]));
    console.log('validatedOutput', JSON.stringify(validatedOutput, null, 2));
    return validatedOutput;
  } catch (err) {
    console.log(err);
    return null;
  }
};

const nlQuerySchema = {
  type: 'json_schema',
  json_schema: {
    strict: true,
    name: 'NaturalLanguageQueryParams',
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        searchString: { type: ['string', 'null'] },
        streetAddress: { type: ['string', 'null'] },
        neighborhood: { type: ['string', 'null'] },
        openAt: { type: ['string', 'null'] },
        gender: { type: ['string', 'null'] },
        membership: { type: ['boolean', 'null'] },
        ageMin: { type: ['integer', 'null'] },
        ageMax: { type: ['integer', 'null'] },
        referralRequired: { type: ['boolean', 'null'] },
        photoIdRequired: { type: ['boolean', 'null'] },
        zipcodes: {
          type: ['array', 'null'],
          items: { type: 'string' },
        },
        taxonomyNames: {
          type: ['array', 'null'],
          items: { type: 'string' },
        },
      },
      required: [
        'searchString',
        'streetAddress',
        'neighborhood',
        'openAt',
        'gender',
        'membership',
        'ageMin',
        'ageMax',
        'referralRequired',
        'photoIdRequired',
        'zipcodes',
        'taxonomyNames',
      ],
      additionalProperties: false,
    },
  },
};

const VALID_NL_GENDERS = new Set(['male', 'female']);
const ZIPCODE_RE = /^\d{5}$/;
const NL_MAX_AGE = 120;
const NL_MAX_ZIPCODES = 20;
const NL_MAX_TAXONOMY_NAMES = 10;
const NL_MAX_STRING_LEN = 200;

function sanitizeNlParams(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const str = (v) => (typeof v === 'string' ? v.slice(0, NL_MAX_STRING_LEN).trim() || null : null);
  const bool = (v) => (typeof v === 'boolean' ? v : null);

  const ageMin = (Number.isInteger(raw.ageMin) && raw.ageMin >= 0 && raw.ageMin <= NL_MAX_AGE)
    ? raw.ageMin : null;
  const ageMax = (Number.isInteger(raw.ageMax) && raw.ageMax >= 0 && raw.ageMax <= NL_MAX_AGE)
    ? raw.ageMax : null;

  let openAt = null;
  if (typeof raw.openAt === 'string') {
    const d = new Date(raw.openAt);
    // Require an explicit UTC offset (or Z): a naive datetime string would be
    // interpreted in the server's timezone, shifting the intended NY time.
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.openAt.trim());
    if (!Number.isNaN(d.getTime()) && hasOffset) openAt = raw.openAt;
  }

  let gender = null;
  if (typeof raw.gender === 'string') {
    const g = raw.gender.toLowerCase();
    if (VALID_NL_GENDERS.has(g)) gender = g;
  }

  let zipcodes = null;
  if (Array.isArray(raw.zipcodes)) {
    const valid = raw.zipcodes
      .filter(z => typeof z === 'string' && ZIPCODE_RE.test(z))
      .slice(0, NL_MAX_ZIPCODES);
    if (valid.length > 0) zipcodes = valid;
  }

  let taxonomyNames = null;
  if (Array.isArray(raw.taxonomyNames)) {
    const valid = raw.taxonomyNames
      .filter(n => typeof n === 'string' && n.trim().length > 0)
      .map(n => n.trim().slice(0, 100))
      .slice(0, NL_MAX_TAXONOMY_NAMES);
    if (valid.length > 0) taxonomyNames = valid;
  }

  const result = {
    searchString: str(raw.searchString),
    streetAddress: str(raw.streetAddress),
    neighborhood: str(raw.neighborhood),
    openAt,
    gender,
    membership: bool(raw.membership),
    ageMin: (ageMin != null && ageMax != null && ageMin > ageMax) ? null : ageMin,
    ageMax: (ageMin != null && ageMax != null && ageMin > ageMax) ? null : ageMax,
    referralRequired: bool(raw.referralRequired),
    photoIdRequired: bool(raw.photoIdRequired),
    zipcodes,
    taxonomyNames,
  };

  // A result where every field is null carries no filters at all; if we
  // returned it, the caller would skip its raw-query fallback and run an
  // unfiltered search. Treat it like a parser failure instead. (An explicit
  // false — e.g. membership — is a real filter and must not collapse.)
  if (Object.values(result).every(v => v === null)) return null;

  return result;
}

const nlQueryCache = new Map();
const NL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NL_CACHE_MAX_ENTRIES = 1000; // bound memory: this endpoint is public

// Insert into the (insertion-ordered) cache, evicting the oldest entries once
// the cap is reached so a flood of unique queries can't grow the map unbounded.
function nlCacheSet(key, value) {
  nlQueryCache.delete(key);
  nlQueryCache.set(key, value);
  while (nlQueryCache.size > NL_CACHE_MAX_ENTRIES) {
    const oldestKey = nlQueryCache.keys().next().value;
    nlQueryCache.delete(oldestKey);
  }
}

// ---- Abuse / availability controls around the (paid) OpenAI call ----
// This endpoint is public and each uncached query costs money + latency, so we
// guard the upstream call with a timeout, a rate cap, a concurrency cap, a
// per-client cap and a circuit breaker. When any guard trips we return null,
// which the caller treats as "no structured params" and falls back to a plain
// keyword search.
//
// The in-memory guards below are per-instance: in Lambda each concurrent
// instance has its own process, so on their own they don't bound total cost,
// upstream abuse, or a single caller's share of it. They act as a cheap first
// line before the shared-store round-trip; the authoritative cross-instance
// rate limit, per-client limit and circuit breaker live in Postgres via
// ./nl-limiter, and — unlike these in-memory guards — fail CLOSED (deny) if
// that shared store is unavailable, rather than letting Lambda concurrency
// amplify unmetered OpenAI calls during an outage.

const NL_REQUEST_TIMEOUT_MS = 8000; // hard per-call timeout (overrides SDK default)
const NL_MAX_RETRIES = 1; // bound retry amplification of the upstream cost

// Fixed-window global rate limit (cost control across all callers).
const NL_RATE_WINDOW_MS = 60 * 1000;
const NL_RATE_MAX_REQUESTS = 60; // max uncached OpenAI calls per window
let nlWindowStart = Date.now();
let nlWindowCount = 0;

// Concurrency cap: prevents a burst from piling up in-flight upstream requests.
const NL_MAX_CONCURRENT = 10;
let nlInFlight = 0;

// Circuit breaker: stop hammering OpenAI while it is failing.
const NL_CB_FAILURE_THRESHOLD = 5;
const NL_CB_OPEN_MS = 60 * 1000;
let nlCbFailures = 0;
let nlCbOpenedAt = 0;

const nlCircuitOpen = () => nlCbOpenedAt > 0 && (Date.now() - nlCbOpenedAt) < NL_CB_OPEN_MS;

const nlRecordSuccess = () => {
  nlCbFailures = 0;
  nlCbOpenedAt = 0;
};

const nlRecordFailure = () => {
  nlCbFailures += 1;
  if (nlCbFailures >= NL_CB_FAILURE_THRESHOLD) {
    nlCbOpenedAt = Date.now();
    console.warn(`NL query: circuit breaker opened after ${nlCbFailures} consecutive failures`);
  }
};

const nlAllowInWindow = () => {
  const now = Date.now();
  if (now - nlWindowStart >= NL_RATE_WINDOW_MS) {
    nlWindowStart = now;
    nlWindowCount = 0;
  }
  if (nlWindowCount >= NL_RATE_MAX_REQUESTS) return false;
  nlWindowCount += 1;
  return true;
};

// `query` is expected to already have gone through `redactPii`
// (src/utils/redact-pii.js) at the call site in controllers/locations.js
// before it reaches here — see PRIVACY.md for what that does and doesn't
// cover. `clientId` identifies the caller (e.g. their IP, via
// utils/request.getClientIp) for the per-client rate limit below; callers
// that can't identify a client share the 'unknown' bucket.
export const parseNaturalLanguageQuery = async (query, currentDatetime, clientId = 'unknown') => {
  // Relative time expressions ("open now", "tonight") resolve against
  // currentDatetime, so a cached result is only valid for queries made around
  // the same time. Bucket the datetime at the cache TTL and include it in the
  // key so an entry can never be reused across a time-bucket boundary.
  const datetimeBucket = Math.floor(new Date(currentDatetime).getTime() / NL_CACHE_TTL_MS);
  const cacheKey = `${datetimeBucket}:${query.toLowerCase().trim()}`;
  const cached = nlQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < NL_CACHE_TTL_MS) {
    return cached.result;
  }

  // Cheap per-instance guards first (avoid a DB round-trip on a hot instance
  // that is already over its own limits). Skip the upstream call — the caller
  // falls back to keyword search — when any guard trips.
  if (nlCircuitOpen()) {
    console.warn('NL query: circuit breaker open, skipping OpenAI call');
    return null;
  }
  if (nlInFlight >= NL_MAX_CONCURRENT) {
    console.warn('NL query: concurrency cap reached, skipping OpenAI call');
    return null;
  }
  if (!nlAllowInWindow()) {
    console.warn('NL query: rate limit reached, skipping OpenAI call');
    return null;
  }

  // Reserve the in-flight slot before any awaits so the concurrency cap stays
  // precise across the shared-store round-trips below; the finally releases it.
  nlInFlight += 1;
  try {
    // Authoritative cross-instance guards backed by Postgres. The per-client
    // check runs BEFORE the global one: both charge their window as part of
    // the admission check, and if the global counter were charged first, a
    // single client could spend the whole global budget on requests that the
    // per-client limit then rejects, starving every other caller. In this
    // order a rejected client only burns their own allowance, which caps how
    // much global capacity any one client can consume.
    if (await nlLimiter.isCircuitOpen()) {
      console.warn('NL query: global circuit breaker open, skipping OpenAI call');
      return null;
    }
    if (!(await nlLimiter.allowClientInWindow(clientId))) {
      console.warn('NL query: per-client rate limit reached, skipping OpenAI call');
      return null;
    }
    if (!(await nlLimiter.allowInWindow())) {
      console.warn('NL query: global rate limit reached, skipping OpenAI call');
      return null;
    }

    const systemPrompt = `You are a search query parser for a NYC social services directory. Parse the user's natural language search query into structured filter parameters.

The current datetime in America/New_York timezone is: ${currentDatetime}

Extract the following fields if present in the query (return null for fields not mentioned):
- searchString: additional keyword(s) NOT already captured by any other field (taxonomyNames, openAt, gender, membership, age, referralRequired, photoIdRequired, zipcodes, streetAddress). If the entire query is covered by other fields, set searchString to null. Only include words that add meaning beyond what other fields capture (e.g. "free clothes near me" -> taxonomyNames: ["Clothing"], searchString: null; "halal food pantry" -> taxonomyNames: ["Food"], searchString: "halal"; "shelter open tonight for women" -> taxonomyNames: ["Shelter"], openAt: ..., gender: "female", searchString: null)
- streetAddress: a NYC street address if mentioned in the query (e.g. "123 Broadway", "456 W 42nd St", "250 Joralemon Street Brooklyn"). Extract only the street number and street name, omitting borough/city/state/zip if present. Return null if no street address is mentioned. Examples: "food near 123 Main St" -> streetAddress: "123 Main St"; "shelter at 250 Joralemon Street Brooklyn" -> streetAddress: "250 Joralemon Street"
- neighborhood: a NYC neighborhood or borough name if mentioned in the query (e.g. "Harlem", "Bushwick", "Upper West Side", "Brooklyn", "Bronx", "Queens", "Staten Island", "Manhattan"). Return null if no neighborhood or borough is mentioned. Examples: "food pantry in Harlem" -> neighborhood: "Harlem"; "shelters in the Bronx" -> neighborhood: "Bronx"; "clothing near me" -> neighborhood: null
- openAt: an ISO 8601 datetime string in America/New_York time including its UTC offset (e.g. "2026-07-13T20:00:00-04:00"), resolved from relative time expressions ("tonight" = today at 8pm, "now" = current time, "tomorrow morning" = tomorrow at 9am), or null
- gender: "male" or "female" if the query specifies gender, otherwise null
- membership: true if membership is required/mentioned, false if explicitly not required, null if not mentioned
- ageMin: minimum age as integer if mentioned, otherwise null
- ageMax: maximum age as integer if mentioned, otherwise null
- referralRequired: true/false/null based on whether a referral is mentioned
- photoIdRequired: true/false/null based on whether photo ID is mentioned
- zipcodes: a 5-digit NYC zip code string if mentioned, otherwise null
- taxonomyNames: an array of taxonomy names that match the user's query, or null if not applicable. Available top-level taxonomies: Food, Clothing, Personal Care, Shelter, Health, Other service. Available sub-taxonomies: Mental Health, Substance Use Treatment, General Health, Support Groups (under Health); Pets, Education, Employment, Legal Services, Immigration Services, Internship (under Other service); Interview-Ready Clothing, Baby Supplies, Thrift Shop, Coat Drive, Professional Clothing (under Clothing); Food Benefits, Food Delivery / Meals on Wheels, Appliances (under Food); Gym, Baby, Hygiene, Community Services, Activities (under Personal Care); Drop-in Center, Intake, Senior, Transitional Independent Living (TIL), Housing Lottery, Supportive Housing, Residential Recovery, Cooling Center, Referral, Youth, Warming Center, Veterans (under Shelter). Use the most specific matching taxonomy. For example "food" -> ["Food"], "men's shelter" -> ["Shelter"], "mental health support" -> ["Mental Health", "Support Groups"], "drug rehab" -> ["Substance Use Treatment"]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      response_format: nlQuerySchema,
    }, {
      timeout: NL_REQUEST_TIMEOUT_MS,
      maxRetries: NL_MAX_RETRIES,
    });

    const rawResult = JSON.parse(completion.choices[0].message.content);
    const result = sanitizeNlParams(rawResult);
    nlCacheSet(cacheKey, { result, timestamp: Date.now() });
    nlRecordSuccess();
    await nlLimiter.recordSuccess();
    return result;
  } catch (err) {
    nlRecordFailure();
    await nlLimiter.recordFailure();
    throw err;
  } finally {
    nlInFlight -= 1;
  }
};

export default getCommentsHighlights;
