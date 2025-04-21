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

Here are more examples of extracting negative and positive sentiments from comments. In the below examples, positive comments are wrapped in square brackets, like this "[positive comment]", and negative comments are wrapped in curly brackets, like this "{negative comment}":

* [lgbtq friendly], group activities and events, [entertainment for clients] like video games and television, giftcards and parties for
* [everything is cleaned] but they {need more staff to maintain the cleaniness}
* [helped with my housing journey] and [even provided furniture giftcards] after assistance with housing. [received medical care and connection to OBGYN]
* [i feel safe here] but sometimes since it’s an LGBTQ safe space they are targeted. {the person came back trying to kick down the door and harm people}. luckily however the door was secured by a code and it was sturdy.
* the [bathrooms have the label] and the [pajamas provided to overnight clients are non binary]
* The [staff are nice and respectful of pronouns]
* The {place is a little old} and {sometimes unsanitary} bathrooms.
* {The thing they need to work on is their housing opportunities} long-term {and curfew exceptions}.
* area is very busy and {can be sketchy}. It is better to be there during the day.
* {it was pretty messy}, sticky tables and floors, but by the time I was finished [the place was clean again]
* [The mail services were helpful]. I [It usually is over flowing with items.] Today there wasn’t much but business branded collared shirts for NSC. I also asked for a bra, and {they did not have any other sizes} outside of D.
* {Usually is can be rowdy(, and )front window and door were beat up pretty bad}. I know they often replace those things but it doesn’t last very long.
* [staff is very inclusive]. A large portion of the staff is queer themselves. [bathrooms are gender neutral].
* [Very welcoming]
* [Very responsive and helpful]
* [They help get me more hormones]
* [Very friendly]
* [Very knowledgeable]
* [look forward to seeing me].
* {it isn't always as clean} as it could be, even despite the drop-in staff's efforts to maintain some level of cleanliness
* {stuff still happens}.
* [They respect my pronouns and called me by name] consistently even before my name had been officially changed.
* [fairly welcoming and helpful] with their services and quick services
* [wasn't dirty] and looked [fairly well kept]
* [Allow( me )to get food and helped] in that department
* [The staff were nice and there was security, also was fairly empty]
* {There is a lot of animosity} towards anyone who isn't sure
* {Constant dirt and grossness}
* {Still homeless}
* {I had my life threatened} in one of the shelters {they refused to help} with an ongoing investigation with someone from there {pepper spraying and assaulting a disabled person}
* [If you're queer, you're good]
* {not ADA compliant} and {has so many internal issues}.
* It was ok
* [They helped me] with benefits
* [unsanitary]
* [Respectful]
* [resourceful]
* [respect my sexuality and preferences]
* {case manager was cold}
* {They failed to mention} that I am ineligible and {made me go through the process for no reason}
* {Not responsive}
* [guards are welcoming] the staff who did the tour [very welcoming and nice to me !]
* [Didn’t see garbage or dirt] or anything unorganized
* [was still able to come receive( work )assistance]
* [Security, no police allowed inside]
* [lgbtq activities]
* [They usually are on it] when I’ve been around.
* There’s a bunch of youth sometimes gathered up in one place
* [They are helpful] the {wait period sucks}in regards to
* [I felt safe( because )I haven’t seen any discrimination]or lack of celebrations
* [Thank you]
* {don't have a lot of security}
* [The staff are always so helpful] and greet you most of the time :
* [well sanitized].
* [The services cater to LGBT youth] but [I was able to get some stuff] like food, clothes and house products
* [the place is safe. The area is( also )nice]
* [The bathrooms are queer friendly]. {Sometimes they need maintenance}.
* [very welcoming and nice place to thrive as an LGBTQ youth].
* {I didn’t feel truly represented} by staff even down to having my voice heard, {I had to mainly do things myself} in order for [helped me build myself up]to become an advocate, unhelpful in the sense that this place {putting their own needs first}.
* I feel safe because I helped create that space to be safe as of today, unsafe because I was unfortunately a target for a lot of {staff who’ve tried to pick and bully} me because I was advocating for the youth.
* [queer friendly] because of the bathrooms, they do have certain groups for trans and non-binary people. However, every letter needs to be represented meaning {lesbians and pansexuals need more visibility} too.
* [very friendly] and long history with services, lgbtq safe space
* [bathrooms are clean] but i {needs more cleaning}
* [services are useful] after i
* disclosed location but in very busy street. {multiple doors to get through} before you can enter
* [queer friendly and inclusive]
* [The area was clean], the floors looked very clean, the blue seats looked clean as well. {beige seating area( looks like it )is due for a deep clean}.
* {I was pursued by another participant} and [the staff told them to stop]. The staff was aware of the space and what was happening. [I felt safe.]
* [There is a gender neutral bathroom].
* [they love what they do]
* [They keep up with the standards] of Covid 19
* [They was there for me] when I needed them
* [made sure all needs was met]
* {Some people can be bias} towards
* [They're clean]
* [don't allow violence or weapons on site.]
* [run by LGBT people]
* [Always was open] and kept promise's
* [The bathroom was gender neutral]. {I was not asked my pronouns.}
* [This center is clean, and friendly.]{The site can work on its confidentiality} I shouldn’t have heard so much of another {The entry way can also be improved}. They already have a two door system so the first set of doors can house a front desk.
* [Everything was clean]. The surfaces and the general area. [the TV area was very nice].
* {waiting 45min} to speak with the housing navigator, I got my application {I haven’t been able to reach the housing navigator} even after emailing and calling multiple times.
* [It felt calm in the space]
* [The bathrooms were gender neutral. And I was asked my pronouns]
* [Very good]
* [Good]
* [They were attentive to my needs]
* [They are unjudgemental and security is here]
* [They are accepting]
* [made coversation and gave snacks]
* [Was spotless]
* [Very informative]
* [People were friendly]
* [No judgements were made]
* [They’re compassionate]
* Almost neat
* [They’re understanding]
* [It’s a good place]
* I see all kind of people there
* [felt comfortable talking] to everyone
* [Everyone cleans up] after themselves and [shared surfaces are wiped down]
* [Found community, clothes, work]
* [Group ground rules enforced]
* [centered around queer youth]
* {disrespectful and discriminating}
* [floors and everything are always clean]
* {They neglect me}
* [They use pronouns] and respect people who use them
* [I feel safe and respected] in their locations. [I’ve received fantastic services] at CL.
* [They take the cleanliness( of their environment )serious].
* [They’ve helped with all of my physical and mental care needs], and gender transition for the past 3 years. [They’re consistent and communicate well]
* [Safety is important to them]
* [their services are for LGBTQIA+] clients.
* Because my friend was in the front
* Because I went to the bathroom and saw for my self"
* Because of the safety aquirements
* [it’s not streeful]
* [Their Sanitation Is Excellent]
* [Give You Everything You Need]
* [Security( In New Alternative )Is Good]
* [Have Activity’s For Queer] Folks
* [very nice and sweet]
* [help every time I come] here


Please analyze the following user comments:

`;

const renderPrompt = (comments) => {
  const commentsString = comments.map(comment => `* ${comment.content}`).join('\n');
  return `${defaultPrompt}\n \n${commentsString}`;
};

export const getCommentsHighlights = async (comments) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role : "system", "content": "Analyze the following user comments from a review website and return structured JSON."},
        { role: 'user', content: renderPrompt(comments) },
      ],
      response_format: responseJsonSchema 
    });

    return completion.choices[0].message;
  } catch (err) {
    console.log(err);
    return null;
  }
};
