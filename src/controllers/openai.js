/* eslint-disable max-len, no-console */

import OpenAI from 'openai';

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

export default getCommentsHighlights;
