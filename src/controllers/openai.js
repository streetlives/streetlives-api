import OpenAI from 'openai';

const openai = new OpenAI();

const commentsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
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
      required: ['top_positive_comments', 'top_negative_comments', 'top_mixed_comments'],
      additionalProperties: false,
    },
  },
};

const defaultPrompt = `
Find the top 5 comments with NEGATIVE, the top 5 comments with POSITIVE sentiment and the top 5 comments with MIXED from the following list of comments that are the most informative and have the strongest sentiment.

For each comment, identify:

* Sentiment: Classify as Strongly Positive, Strongly Negative, Neutral, or Mixed.
* Informativeness Score (1-5): Rate how detailed and useful the comment is, with 5 being highly informative (e.g., detailed reasons, pros/cons, comparisons) and 1 being vague or generic.
* Comment: Reproduce the comment verbatim.
* Key Positive Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has positive sentiment and is around five words long. Don't excerpt the entire comment.
* Key Negative Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has negative sentiment and is around five words long. Don't excerpt the entire comment.

Here are example outputs showing some example comments and takeaways.

Example Inputs:

* They actively keep the site safe and don't allow violence or weapons on site
* I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe
* The area was clean, the floors looked very clean, the blue seats looked clean as well. But the beige seating area looks like it is due for a deep clean

Example Output as JSON:

\`\`\`json
{
  "top_positive_comments": [
    {
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

\`\`\`
* lgbtq friendly, group activities and events, entertainment for clients like video games and television, giftcards and parties for
* everything is cleaned but they need more staff to maintain the cleaniness
* helped with my housing journey and even provided furniture giftcards after assistance with housing. received medical care and connection to OBGYN
* i feel safe here but sometimes since it’s an LGBTQ safe space they are targeted. the person came back trying to kick down the door and harm people. luckily however the door was secured by a code and it was sturdy.
* the bathrooms have the label and the pajamas provided to overnight clients are non binary
* The staff are nice and respectful of pronouns
* The place is a little old and sometimes unsanitary bathrooms.
* The thing they need to work on is their housing opportunities long-term and curfew exceptions.
* area is very busy and can be sketchy. It is better to be there during the day.
* it was pretty messy, sticky tables and floors, but by the time I was finished the place was clean again
* The mail services were helpful. I It usually is over flowing with items. Today there wasn’t much but business branded collared shirts for NSC. I also asked for a bra, and they did not have any other sizes outside of D.
* Usually is can be rowdy(, and )front window and door were beat up pretty bad. I know they often replace those things but it doesn’t last very long.
* staff is very inclusive. A large portion of the staff is queer themselves. bathrooms are gender neutral.
* Very welcoming
* Very responsive and helpful
* They help get me more hormones
* Very friendly
* Very knowledgeable
* look forward to seeing me.
* it isn't always as clean as it could be, even despite the drop-in staff's efforts to maintain some level of cleanliness
* stuff still happens.
* They respect my pronouns and called me by name consistently even before my name had been officially changed.
* fairly welcoming and helpful with their services and quick services
* wasn't dirty and looked fairly well kept
* Allow( me )to get food and helped in that department
* The staff were nice and there was security, also was fairly empty
* There is a lot of animosity towards anyone who isn't sure
* Constant dirt and grossness
* Still homeless
* I had my life threatened in one of the shelters they refused to help with an ongoing investigation with someone from there pepper spraying and assaulting a disabled person
* If you're queer, you're good
* not ADA compliant and has so many internal issues.
* It was ok
* They helped me with benefits
* unsanitary
* Respectful
* resourceful
* respect my sexuality and preferences
* case manager was cold
* They failed to mention that I am ineligible and made me go through the process for no reason
* Not responsive
* guards are welcoming the staff who did the tour very welcoming and nice to me !
* Didn’t see garbage or dirt or anything unorganized
* was still able to come receive( work )assistance
* Security, no police allowed inside
* lgbtq activities
* They usually are on it when I’ve been around.
* There’s a bunch of youth sometimes gathered up in one place
* They are helpful the wait period sucksin regards to
* I felt safe( because )I haven’t seen any discriminationor lack of celebrations
* Thank you
* don't have a lot of security
* The staff are always so helpful and greet you most of the time :
* well sanitized.
* The services cater to LGBT youth but I was able to get some stuff like food, clothes and house products
* the place is safe. The area is( also )nice
* The bathrooms are queer friendly. Sometimes they need maintenance.
* very welcoming and nice place to thrive as an LGBTQ youth.
* I didn’t feel truly represented by staff even down to having my voice heard, I had to mainly do things myself in order for helped me build myself upto become an advocate, unhelpful in the sense that this place putting their own needs first.
* I feel safe because I helped create that space to be safe as of today, unsafe because I was unfortunately a target for a lot of staff who’ve tried to pick and bully me because I was advocating for the youth.
* queer friendly because of the bathrooms, they do have certain groups for trans and non-binary people. However, every letter needs to be represented meaning lesbians and pansexuals need more visibility too.
* very friendly and long history with services, lgbtq safe space
* bathrooms are clean but i needs more cleaning
* services are useful after i
* disclosed location but in very busy street. multiple doors to get through before you can enter
* queer friendly and inclusive
* The area was clean, the floors looked very clean, the blue seats looked clean as well. beige seating area( looks like it )is due for a deep clean.
* I was pursued by another participant and the staff told them to stop. The staff was aware of the space and what was happening. I felt safe.
* There is a gender neutral bathroom.
* they love what they do
* They keep up with the standards of Covid 19
* They was there for me when I needed them
* made sure all needs was met
* Some people can be bias towards
* They're clean
* don't allow violence or weapons on site.
* run by LGBT people
* Always was open and kept promise's
* The bathroom was gender neutral. I was not asked my pronouns.
* This center is clean, and friendly.The site can work on its confidentiality I shouldn’t have heard so much of another The entry way can also be improved. They already have a two door system so the first set of doors can house a front desk.
* Everything was clean. The surfaces and the general area. the TV area was very nice.
* waiting 45min to speak with the housing navigator, I got my application I haven’t been able to reach the housing navigator even after emailing and calling multiple times.
* It felt calm in the space
* The bathrooms were gender neutral. And I was asked my pronouns
* Very good
* Good
* They were attentive to my needs
* They are unjudgemental and security is here
* They are accepting
* made coversation and gave snacks
* Was spotless
* Very informative
* People were friendly
* No judgements were made
* They’re compassionate
* Almost neat
* They’re understanding
* It’s a good place
* I see all kind of people there
* felt comfortable talking to everyone
* Everyone cleans up after themselves and shared surfaces are wiped down
* Found community, clothes, work
* Group ground rules enforced
* centered around queer youth
* disrespectful and discriminating
* floors and everything are always clean
* They neglect me
* They use pronouns and respect people who use them
* I feel safe and respected in their locations. I’ve received fantastic services at CL.
* They take the cleanliness( of their environment )serious.
* They’ve helped with all of my physical and mental care needs, and gender transition for the past 3 years. They’re consistent and communicate well
* Safety is important to them
* their services are for LGBTQIA+ clients.
* Because my friend was in the front
* Because I went to the bathroom and saw for my self"
* Because of the safety aquirements
* it’s not streeful
* Their Sanitation Is Excellent
* Give You Everything You Need
* Security( In New Alternative )Is Good
* Have Activity’s For Queer Folks
* very nice and sweet
* help every time I come here
\`\`\`

Example Output JSON:

\`\`\`json
{
    "top_positive_comments": [
        {
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
            "comment": "the bathrooms have the label and the pajamas provided to overnight clients are non binary",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "bathrooms have the label",
                "pajamas provided to overnight clients are non binary"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "The staff are nice and respectful of pronouns",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "staff are nice and respectful of pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "Very welcoming",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very welcoming"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Very responsive and helpful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very responsive and helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They help get me more hormones",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They help get me more hormones"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Very friendly",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Very knowledgeable",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very knowledgeable"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "look forward to seeing me.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "look forward to seeing me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They respect my pronouns and called me by name consistently even before my name had been officially changed.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They respect my pronouns and called me by name"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "fairly welcoming and helpful with their services and quick services",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "fairly welcoming and helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "Allow( me )to get food and helped in that department",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Allow( me )to get food and helped"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "The staff were nice and there was security, also was fairly empty",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The staff were nice and there was security, also was fairly empty"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "If you're queer, you're good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "If you're queer, you're good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They helped me with benefits",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They helped me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "unsanitary",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "unsanitary"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Respectful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Respectful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "resourceful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "resourceful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "respect my sexuality and preferences",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "respect my sexuality and preferences"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "Didn\u2019t see garbage or dirt or anything unorganized",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Didn\u2019t see garbage or dirt"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "was still able to come receive( work )assistance",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "was still able to come receive( work )assistance"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Security, no police allowed inside",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Security, no police allowed inside"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "lgbtq activities",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "lgbtq activities"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They usually are on it when I\u2019ve been around.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They usually are on it"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "I felt safe( because )I haven\u2019t seen any discriminationor lack of celebrations",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "I felt safe( because )I haven\u2019t seen any discrimination"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Thank you",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Thank you"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "The staff are always so helpful and greet you most of the time :",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The staff are always so helpful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "well sanitized.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "well sanitized"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "the place is safe. The area is( also )nice",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "the place is safe. The area is( also )nice"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "very welcoming and nice place to thrive as an LGBTQ youth.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very welcoming and nice place to thrive as an LGBTQ youth"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "very friendly and long history with services, lgbtq safe space",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "services are useful after i",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "services are useful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "queer friendly and inclusive",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "queer friendly and inclusive"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "There is a gender neutral bathroom.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "There is a gender neutral bathroom"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "they love what they do",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "they love what they do"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They keep up with the standards of Covid 19",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They keep up with the standards"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They was there for me when I needed them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They was there for me"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "made sure all needs was met",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "made sure all needs was met"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They're clean",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They're clean"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "don't allow violence or weapons on site.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "don't allow violence or weapons on site."
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "run by LGBT people",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "run by LGBT people"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Always was open and kept promise's",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Always was open"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "It felt calm in the space",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "It felt calm in the space"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "The bathrooms were gender neutral. And I was asked my pronouns",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "The bathrooms were gender neutral. And I was asked my pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Very good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They were attentive to my needs",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They were attentive to my needs"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They are unjudgemental and security is here",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They are unjudgemental and security is here"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They are accepting",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They are accepting"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "made coversation and gave snacks",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "made coversation and gave snacks"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Was spotless",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Was spotless"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Very informative",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Very informative"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "People were friendly",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "People were friendly"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "No judgements were made",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "No judgements were made"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They\u2019re compassionate",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They\u2019re compassionate"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They\u2019re understanding",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They\u2019re understanding"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "It\u2019s a good place",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "It\u2019s a good place"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "felt comfortable talking to everyone",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "felt comfortable talking"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "Found community, clothes, work",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Found community, clothes, work"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Group ground rules enforced",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Group ground rules enforced"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "centered around queer youth",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "centered around queer youth"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "floors and everything are always clean",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "floors and everything are always clean"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "They use pronouns and respect people who use them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They use pronouns"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "They take the cleanliness( of their environment )serious.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "They take the cleanliness( of their environment )serious"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "Safety is important to them",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Safety is important to them"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "their services are for LGBTQIA+ clients.",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "their services are for LGBTQIA+"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "it\u2019s not streeful",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "it\u2019s not streeful"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Their Sanitation Is Excellent",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Their Sanitation Is Excellent"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Give You Everything You Need",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Give You Everything You Need"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Security( In New Alternative )Is Good",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Security( In New Alternative )Is Good"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "Have Activity\u2019s For Queer Folks",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "Have Activity\u2019s For Queer"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
            "comment": "very nice and sweet",
            "sentiment": "Positive",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [
                "very nice and sweet"
            ],
            "key_negative_sentiment_takeaways": []
        },
        {
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
            "comment": "area is very busy and can be sketchy. It is better to be there during the day.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "can be sketchy"
            ]
        },
        {
            "comment": "Usually is can be rowdy(, and )front window and door were beat up pretty bad. I know they often replace those things but it doesn\u2019t last very long.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Usually is can be rowdy(, and )front window and door were beat up pretty bad"
            ]
        },
        {
            "comment": "it isn't always as clean as it could be, even despite the drop-in staff's efforts to maintain some level of cleanliness",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "it isn't always as clean"
            ]
        },
        {
            "comment": "stuff still happens.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "stuff still happens"
            ]
        },
        {
            "comment": "There is a lot of animosity towards anyone who isn't sure",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "There is a lot of animosity"
            ]
        },
        {
            "comment": "Constant dirt and grossness",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Constant dirt and grossness"
            ]
        },
        {
            "comment": "Still homeless",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Still homeless"
            ]
        },
        {
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
            "comment": "case manager was cold",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "case manager was cold"
            ]
        },
        {
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
            "comment": "Not responsive",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Not responsive"
            ]
        },
        {
            "comment": "don't have a lot of security",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "don't have a lot of security"
            ]
        },
        {
            "comment": "I feel safe because I helped create that space to be safe as of today, unsafe because I was unfortunately a target for a lot of staff who\u2019ve tried to pick and bully me because I was advocating for the youth.",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "staff who\u2019ve tried to pick and bully"
            ]
        },
        {
            "comment": "disclosed location but in very busy street. multiple doors to get through before you can enter",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "multiple doors to get through"
            ]
        },
        {
            "comment": "Some people can be bias towards",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "Some people can be bias"
            ]
        },
        {
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
            "comment": "disrespectful and discriminating",
            "sentiment": "Negative",
            "informativeness_score": 3,
            "key_positive_sentiment_takeaways": [],
            "key_negative_sentiment_takeaways": [
                "disrespectful and discriminating"
            ]
        },
        {
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

const renderPrompt = (comments) => {
  return comments.map(comment => `* ${comment}`).join('\n');
};

const getCommentsHighlights = async (comments) => {
  const commentContents = comments.map(comment => (
    comment.content.replaceAll('\n', ' ').replaceAll('\r', ' ').trim()
  ));
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: defaultPrompt },
        { role: 'user', content: renderPrompt(commentContents) },
      ],
      response_format: responseJsonSchema,
    });

    return completion.choices[0].message;
  } catch (err) {
    console.log(err);
    return null;
  }
};

export default getCommentsHighlights;
