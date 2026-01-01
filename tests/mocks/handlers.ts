import { http, HttpResponse } from 'msw';

// Mock Claude API response
export const handlers = [
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = (await request.json()) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      tools?: Array<{ name: string }>;
    };

    // Check if tools are provided and simulate tool use
    const lastMessage = body.messages[body.messages.length - 1];
    const messageContent = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : '';

    // Simulate tool call for specific patterns
    if (messageContent.toLowerCase().includes('run') && body.tools?.some(t => t.name === 'bash')) {
      return HttpResponse.json({
        id: 'msg_mock_tool',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'bash',
            input: { command: 'echo "hello"' },
          },
        ],
        model: body.model,
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    }

    // Default text response
    return HttpResponse.json({
      id: 'msg_mock_123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `I received your message: "${messageContent}"`,
        },
      ],
      model: body.model,
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
  }),
];
