/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import process from 'process';

import { Ollama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  StructuredOutputParser,
  StringOutputParser,
} from '@langchain/core/output_parsers';
import LLMEngineType from '@utils/llmEngineTypes';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { QType } from '@utils/questionTypes';
import { DatetimeOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import {
  getChatGptApiKey,
  getGeminiApiKey,
  getMistralApiKey,
  getAnthropicApiKey,
} from '@utils/getProperties';

type LLMInstance =
  | ChatOpenAI
  | Ollama
  | ChatGoogleGenerativeAI
  | ChatAnthropic
  | ChatMistralAI;

export class LLMEngine {
  private static instance: LLMEngine;
  private static engine: LLMEngineType;
  private static instances: Record<LLMEngineType, LLMInstance | undefined> = {
    [LLMEngineType.ChatGPT]: undefined,
    [LLMEngineType.Gemini]: undefined,
    [LLMEngineType.Ollama]: undefined,
    [LLMEngineType.Mistral]: undefined,
    [LLMEngineType.Anthropic]: undefined,
  };

  private static apiKeys: Record<string, string | undefined> = {
    chatGptApiKey: undefined,
    geminiApiKey: undefined,
    mistralApiKey: undefined,
    anthropicApiKey: undefined,
  };

  private constructor(engine: LLMEngineType) {
    LLMEngine.engine = engine;

    LLMEngine.fetchApiKeys()
      .then(() => {
        console.log('API keys fetched:', LLMEngine.apiKeys);

        try {
          LLMEngine.instantiateEngine(LLMEngine.engine);
        } catch (error) {
          console.error('Error instantiating engine:', error);
        }
      })
      .catch((error) => {
        console.error('Error fetching API keys:', error);
      });
  }

  private static async fetchApiKeys(): Promise<void> {
    LLMEngine.apiKeys.chatGptApiKey = await getChatGptApiKey();
    LLMEngine.apiKeys.geminiApiKey = await getGeminiApiKey();
    LLMEngine.apiKeys.mistralApiKey = await getMistralApiKey();
    LLMEngine.apiKeys.anthropicApiKey = await getAnthropicApiKey();
  }

  public static instantiateEngine(engine: LLMEngineType): LLMInstance {
    if (LLMEngine.instances[engine]) {
      return LLMEngine.instances[engine];
    }

    switch (engine) {
      case LLMEngineType.ChatGPT:
        LLMEngine.instances[engine] = new ChatOpenAI({
          model: 'gpt-4',
          apiKey: LLMEngine.apiKeys.chatGptApiKey as string,
        });
        break;
      case LLMEngineType.Gemini:
        LLMEngine.instances[engine] = new ChatGoogleGenerativeAI({
          model: 'gemini-pro',
          temperature: 0,
          maxRetries: 2,
          apiKey: LLMEngine.apiKeys.geminiApiKey as string,
        });
        break;
      case LLMEngineType.Ollama:
        LLMEngine.instances[engine] = new Ollama({
          model: 'gemma2:2b',
          temperature: 0,
          maxRetries: 2,
        });
        break;
      case LLMEngineType.Mistral:
        LLMEngine.instances[engine] = new ChatMistralAI({
          model: 'mistral-large-latest',
          temperature: 0,
          maxRetries: 2,
          apiKey: LLMEngine.apiKeys.mistralApiKey as string,
        });
        break;
      case LLMEngineType.Anthropic:
        LLMEngine.instances[engine] = new ChatAnthropic({
          model: 'claude-3-haiku-20240307',
          temperature: 0,
          maxRetries: 2,
          apiKey: LLMEngine.apiKeys.anthropicApiKey as string,
        });
        break;
    }

    return LLMEngine.instances[engine];
  }

  public static getInstance(engine: LLMEngineType): LLMEngine {
    if (!LLMEngine.instance) {
      LLMEngine.instance = new LLMEngine(engine);
    } else {
      LLMEngine.instantiateEngine(engine);
    }
    return LLMEngine.instance;
  }

  public async getResponse(
    promptText: string,
    questionType: QType,
  ): Promise<LLMResponse | null> {
    const item = {
      type: 'API_CALL',
      prompt: promptText,
      questionType,
      model: LLMEngine.engine,
    };
    try {
      return await chrome.runtime.sendMessage(item).then((response) => {
        return response?.value;
      });
    } catch (error) {
      console.error('Error getting response:', error);
      return null;
    }
  }

  async invokeLLM(
    promptText: string,
    questionType: QType,
  ): Promise<LLMResponse | null> {
    console.log(promptText);
    console.log(questionType);
    if (!promptText) {
      return null;
    }
    try {
      const parser = LLMEngine.getParser(questionType);
      const modelInstance = LLMEngine.instances[LLMEngine.engine];

      if (modelInstance) {
        const chain = RunnableSequence.from([
          PromptTemplate.fromTemplate(
            'Answer the users question as best as possible.\n{format_instructions}\n{question}',
          ),
          modelInstance,
          parser,
        ]);

        const response = await chain.invoke({
          question: promptText,
          format_instructions: parser.getFormatInstructions(),
        });
        return this.patchResponse(response, questionType);
      }
      return null;
    } catch (error) {
      console.error('Error getting response:', error);
      return null;
    }
  }

  private patchResponse(response: any, questionType: QType): LLMResponse {
    switch (questionType) {
      case QType.DATE:
      case QType.TIME:
      case QType.DATE_AND_TIME:
      case QType.DATE_TIME_WITHOUT_YEAR:
      case QType.DATE_TIME_WITH_MERIDIEM:
      case QType.DATE_TIME_WITH_MERIDIEM_WITHOUT_YEAR:
      case QType.DATE_WITHOUT_YEAR:
      case QType.TIME_WITH_MERIDIEM:
      case QType.DURATION:
        return { date: response as Date };
      case QType.LINEAR_SCALE:
        return { linearScale: response as LinearScaleResponse };
      case QType.MULTIPLE_CHOICE:
      case QType.MULTIPLE_CHOICE_WITH_OTHER:
        return { multipleChoice: response as MultiCorrectOrMultipleOption };
      case QType.MULTI_CORRECT:
      case QType.MULTI_CORRECT_WITH_OTHER:
        return { multiCorrect: response as MultiCorrectOrMultipleOption[] };
      case QType.MULTIPLE_CHOICE_GRID:
        return { multipleChoiceGrid: response as RowColumn[] };
      case QType.CHECKBOX_GRID:
        return { checkboxGrid: response as RowColumnOption[] };
      case QType.TEXT_EMAIL:
      case QType.TEXT_URL:
      case QType.DROPDOWN:
        return { genericResponse: response as GenericLLMResponse };
      case QType.PARAGRAPH:
      case QType.TEXT:
        return { text: response as string };
    }
  }

  private static getParser(
    questionType: QType,
  ): StructuredOutputParser<any> | DatetimeOutputParser | StringOutputParser {
    switch (questionType) {
      case QType.TEXT:
      case QType.PARAGRAPH:
        return new StringOutputParser();
      case QType.TEXT_EMAIL:
        return StructuredOutputParser.fromNamesAndDescriptions({
          answer:
            'Give Correct Email corresponding to given question or give random@gmail.com',
        });
      case QType.TEXT_URL:
        return StructuredOutputParser.fromNamesAndDescriptions({
          answer: 'Give Correct Url corresponding to given question',
        });
      case QType.DATE:
      case QType.TIME:
      case QType.DATE_AND_TIME:
      case QType.DATE_TIME_WITHOUT_YEAR:
      case QType.DATE_TIME_WITH_MERIDIEM:
      case QType.DATE_TIME_WITH_MERIDIEM_WITHOUT_YEAR:
      case QType.DATE_WITHOUT_YEAR:
      case QType.TIME_WITH_MERIDIEM:
      case QType.DURATION:
        return new DatetimeOutputParser();
      case QType.LINEAR_SCALE:
        return StructuredOutputParser.fromZodSchema(
          z.object({
            answer: z
              .number()
              .describe(
                "The integer answer to the user's question as the key corresponding to the calculated answer",
              ),
          }),
        );
      case QType.DROPDOWN:
        return StructuredOutputParser.fromNamesAndDescriptions({
          answer: "answer to the user's question",
        });
      case QType.CHECKBOX_GRID: {
        const checkboxGridColSchema = z.object({
          data: z
            .string()
            .describe(
              "The name or label of the column in the checkbox grid which is correct as per user's question",
            ),
        });

        const checkboxGridRowSchema = z.object({
          row: z
            .string()
            .describe('The label or name of the row in the checkbox grid'),
          cols: z
            .array(checkboxGridColSchema)
            .describe(
              'The list of correct columns associated with the row to be marked as checked',
            ),
        });

        const checkboxGridArraySchema = z
          .array(checkboxGridRowSchema)
          .describe(
            'An array of rows for the checkbox grid, each with a list of columns',
          );

        return StructuredOutputParser.fromZodSchema(checkboxGridArraySchema);
      }
      case QType.MULTIPLE_CHOICE_GRID: {
        const multipleChoiceGridRowSchema = z.object({
          row: z
            .string()
            .describe(
              'The label or name of the row in the multiple-choice grid',
            ),
          selectedColumn: z
            .string()
            .describe(
              'The column selected for the given row in the multiple-choice grid that is correct as per user question',
            ),
        });

        const multipleChoiceGridArraySchema = z
          .array(multipleChoiceGridRowSchema)
          .describe(
            'An array of rows for the multiple-choice grid, each with a selected column',
          );

        return StructuredOutputParser.fromZodSchema(
          multipleChoiceGridArraySchema,
        );
      }
      case QType.MULTIPLE_CHOICE:
      case QType.MULTIPLE_CHOICE_WITH_OTHER:
      case QType.MULTI_CORRECT:
      case QType.MULTI_CORRECT_WITH_OTHER: {
        const multiCorrectOrMultipleOptionSchema = z
          .object({
            optionText: z
              .string()
              .optional()
              .describe(
                "The text of the option. Optional if 'isOther' is true.",
              ),
            isOther: z
              .boolean()
              .describe(
                "Indicates if this is an 'other' option. This field is required.",
              ),
            otherOptionValue: z
              .string()
              .optional()
              .describe(
                "The value for the 'other' option. Must be provided if 'isOther' is true.",
              ),
          })
          .refine(
            (data) => !data.isOther || (data.isOther && data.otherOptionValue),
            {
              message:
                "'otherOptionValue' must be provided if 'isOther' is true",
              path: ['otherOptionValue'],
            },
          );

        if (
          questionType === QType.MULTI_CORRECT ||
          questionType === QType.MULTI_CORRECT_WITH_OTHER
        ) {
          const multiCorrectOptionsArraySchema = z
            .array(multiCorrectOrMultipleOptionSchema)
            .describe(
              "An array of options for multi-correct or multiple-choice with optional 'other' option",
            );

          return StructuredOutputParser.fromZodSchema(
            multiCorrectOptionsArraySchema,
          );
        } else {
          // For multiple-choice with optional 'other' option
          return StructuredOutputParser.fromZodSchema(
            multiCorrectOrMultipleOptionSchema.describe(
              "Schema for a single option in multiple-choice with an optional 'other' option",
            ),
          );
        }
      }
    }
  }
}
