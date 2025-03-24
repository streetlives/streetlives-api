import OpenAI from 'openai';

const openai = new OpenAI();

const defaultPrompt = `
        Analyze the following user comments from a review website.
        Find the top 5 comments with NEGATIVE, the top 5 comments with POSITIVE sentiment and the top 5 comments with MIXED from the following list of comments that are the most informative and have the strongest sentiment.
        For each comment, identify:
        Sentiment: Classify as Strongly Positive, Strongly Negative, Neutral, or Mixed.
        Informativeness Score (1-5): Rate how detailed and useful the comment is, with 5 being highly informative (e.g., detailed reasons, pros/cons, comparisons) and 1 being vague or generic.
        Comment: Reproduce the comment verbatim.
        Key Positive Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has positive sentiment and is around five words long. Don't excerpt the entire comment.
        Key Negative Sentiment Takeaways: A meaningful excerpt extracted verbatim from the comment that has negative sentiment and is around five words long. Don't excerpt the entire comment.

        Example Input:

        Great place, one of the best soup kitchens, they have a little of everything and give generously, but one problem is disrespect in the dining room between guests.
        Example Output as JSON:

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
              "key_negative_sentiment_takeaways": [“looks like it is due for a deep clean”]
            }
          ]
        }
  `;

const renderPrompt = (comments) => {
  const commentsString = comments.map(comment => comment.content).join('\n');
  return `${defaultPrompt}\n \n${commentsString}`;
};

export const getCommentsHighlights = async (comments) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: renderPrompt(comments) },
      ],
    });

    return completion.choices[0].message;
  } catch (err) {
    console.log(err);
    return null;
  }
};
