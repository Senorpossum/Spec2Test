import { UserStory, AcceptanceCriterion, Scenario, StoryMetadata } from '../types/index.js';

/**
 * Parses user stories from various formats (Markdown, Jira, Linear, plain text)
 * into a structured UserStory format for the test generation engine.
 */
export class StoryParser {
    private storyCounter = 0;

    /**
     * Parse user stories from a string input.
     * Automatically detects format and parses accordingly.
     */
    parse(input: string): UserStory[] {
        const trimmed = input.trim();
        if (!trimmed) {
            return [];
        }

        // Detect format and route to appropriate parser
        if (this.isMarkdownFormat(trimmed)) {
            return this.parseMarkdown(trimmed);
        }
        if (this.isJiraFormat(trimmed)) {
            return this.parseJira(trimmed);
        }
        if (this.isLinearFormat(trimmed)) {
            return this.parseLinear(trimmed);
        }

        // Default to plain text parser
        return this.parsePlainText(trimmed);
    }

    /**
     * Parse multiple user stories from a Markdown file content.
     */
    private parseMarkdown(input: string): UserStory[] {
        const stories: UserStory[] = [];
        const storyBlocks = this.splitStoryBlocks(input);

        for (const block of storyBlocks) {
            const story = this.extractStoryFromMarkdown(block);
            if (story) {
                stories.push(story);
            }
        }

        return stories;
    }

    /**
     * Split input into individual story blocks.
     * Stories are separated by --- or ## headers.
     */
    private splitStoryBlocks(input: string): string[] {
        // Try splitting by --- separator first
        const dashedSplit = input.split(/\n---\s*\n/);

        if (dashedSplit.length > 1) {
            return dashedSplit.filter((b) => b.trim().length > 0);
        }

        // Try splitting by ## headers
        const headerSplit = input.split(/\n##\s+/);

        if (headerSplit.length > 1) {
            return headerSplit.map((block) => `## ${block}`).filter((b) => b.trim().length > 0);
        }

        // Single story
        return [input];
    }

    /**
     * Extract a structured UserStory from a Markdown block.
     */
    private extractStoryFromMarkdown(block: string): UserStory | null {
        const lines = block.split('\n');

        // Extract title (from ## header or first line)
        const titleMatch = block.match(/##\s+(.+?)\n/);
        const title = titleMatch ? titleMatch[1].trim() : lines[0].replace(/^#+\s*/, '').trim();

        if (!title) {
            return null;
        }

        // Extract description (As a ... I want to ... So that ...)
        const description = this.extractUserStoryDescription(block);

        // Extract actor, action, purpose
        const { actor, action, purpose } = this.parseUserStoryStructure(description);

        // Extract acceptance criteria
        const acceptanceCriteria = this.extractAcceptanceCriteria(block);

        // Extract metadata (priority, tags, complexity)
        const metadata = this.extractMetadata(block);

        this.storyCounter++;

        return {
            id: `story-${this.storyCounter}`,
            title,
            description,
            actor,
            action,
            purpose,
            acceptanceCriteria,
            metadata,
        };
    }

    /**
     * Extract the user story description (As a ... I want ... So that ...).
     */
    private extractUserStoryDescription(block: string): string {
        const storyMatch = block.match(/(?:user\s+story|description|summary)[:\s]*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*#+|\n\s*Acceptance|\n\s*Priority|\n---|$)/is);
        if (storyMatch) {
            return storyMatch[1].trim();
        }

        // Look for "As a" pattern anywhere in the text
        const asAMatch = block.match(/As\s+a\s+[^.]+(?:\.[^.]+)*\.\s*(?:I\s+want(?:\s+to)?[^.]+\.?\s*(?:So\s+that[^.]+\.?)*)/is);
        if (asAMatch) {
            return asAMatch[0];
        }

        // Fallback: return first non-header, non-empty line
        const firstContentLine = block
            .split('\n')
            .find((line) => !line.startsWith('#') && line.trim().length > 0);

        return firstContentLine?.trim() || '';
    }

    /**
     * Parse the standard "As a X, I want Y, so that Z" structure.
     */
    private parseUserStoryStructure(description: string): {
        actor: string;
        action: string;
        purpose: string;
    } {
        const asMatch = description.match(/As\s+a\s+([^.]+)\.\s*(?:I\s+want(?:\s+to)?\s+([^.]+)\.\s*(?:So\s+that)\s+([^.]+)\.)?/is);

        if (asMatch) {
            return {
                actor: asMatch[1].trim(),
                action: asMatch[2]?.trim() || '',
                purpose: asMatch[3]?.trim() || '',
            };
        }

        // If no standard format, return the whole description as action
        return {
            actor: 'user',
            action: description.substring(0, 100),
            purpose: '',
        };
    }

    /**
     * Extract acceptance criteria from a story block.
     * Supports Gherkin (Given/When/Then) and bullet-point formats.
     */
    private extractAcceptanceCriteria(block: string): AcceptanceCriterion[] {
        const criteria: AcceptanceCriterion[] = [];

        // Look for Acceptance Criteria section
        const criteriaSectionMatch = block.match(
            /Acceptance\s+Criteria[:\s]*\n([\s\S]*?)(?=\n\s*#+|\n---|$)/is,
        );

        if (!criteriaSectionMatch) {
            // No explicit section, try to find individual AC items
            return this.extractInlineAcceptanceCriteria(block);
        }

        const criteriaText = criteriaSectionMatch[1];
        const criteriaBlocks = this.splitAcceptanceCriteria(criteriaText);

        let criterionIndex = 0;
        for (const criterionBlock of criteriaBlocks) {
            criterionIndex++;
            const scenario = this.extractGherkinScenarios(criterionBlock);

            criteria.push({
                id: `ac-${criterionIndex}`,
                statement: this.extractCriterionStatement(criterionBlock),
                scenario,
            });
        }

        return criteria;
    }

    /**
     * Split acceptance criteria text into individual criteria blocks.
     */
    private splitAcceptanceCriteria(text: string): string[] {
        // Split by bullet points, numbered items, or "Scenario:" headers
        const patterns = [
            /\n(?=\*\s)/, // bullet points
            /\n(?=\d+[.)]\s)/, // numbered
            /\n(?=Scenario:[\s])/g, // Gherkin scenarios
        ];

        for (const pattern of patterns) {
            const parts = text.split(pattern);
            if (parts.length > 1) {
                return parts.map((p) => p.trim()).filter((p) => p.length > 0);
            }
        }

        // Fallback: treat entire section as one criterion
        return [text.trim()];
    }

    /**
     * Extract Gherkin scenarios (Given/When/Then) from a criteria block.
     */
    private extractGherkinScenarios(block: string): Scenario[] {
        const scenarios: Scenario[] = [];
        const lines = block.split('\n');

        let currentScenario: Partial<Scenario> = {
            given: [],
            when: '',
            then: [],
        };
        let hasScenario = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.match(/^(Given|g)\s+/i)) {
                hasScenario = true;
                currentScenario.given = currentScenario.given || [];
                currentScenario.given.push(this.stripGherkinKeyword(trimmed));
            } else if (trimmed.match(/^(When|w)\s+/i)) {
                hasScenario = true;
                currentScenario.when = this.stripGherkinKeyword(trimmed);
            } else if (trimmed.match(/^(Then|t)\s+/i)) {
                hasScenario = true;
                currentScenario.then = currentScenario.then || [];
                currentScenario.then.push(this.stripGherkinKeyword(trimmed));
            } else if (trimmed.match(/^And\s+/i) && hasScenario) {
                if (currentScenario.when) {
                    currentScenario.then = currentScenario.then || [];
                    currentScenario.then.push(this.stripGherkinKeyword(trimmed));
                } else if (currentScenario.given) {
                    currentScenario.given.push(this.stripGherkinKeyword(trimmed));
                }
            }
        }

        if (hasScenario && currentScenario.when) {
            scenarios.push({
                given: currentScenario.given || [],
                when: currentScenario.when,
                then: currentScenario.then || [],
            });
        }

        return scenarios;
    }

    /**
     * Remove Gherkin keywords from a line.
     */
    private stripGherkinKeyword(line: string): string {
        return line
            .replace(/^(Given|g|And)\s+/i, '')
            .replace(/^(When|w)\s+/i, '')
            .replace(/^(Then|t)\s+/i, '')
            .trim();
    }

    /**
     * Extract a human-readable statement from a criterion block.
     */
    private extractCriterionStatement(block: string): string {
        // If there's a bullet point, use that as the statement
        const bulletMatch = block.match(/^\*\s+(.+?)$/m);
        if (bulletMatch) {
            return bulletMatch[1].trim();
        }

        // First non-keyword line
        const lines = block.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (
                trimmed &&
                !trimmed.match(/^(Given|When|Then|And|Scenario|Acceptance)/i)
            ) {
                return trimmed;
            }
        }

        return block.trim().substring(0, 100);
    }

    /**
     * Extract acceptance criteria when they're inline (not in a dedicated section).
     */
    private extractInlineAcceptanceCriteria(block: string): AcceptanceCriterion[] {
        const criteria: AcceptanceCriterion[] = [];

        // Look for "AC:", "Acceptance:", or bullet points that look like criteria
        const acPattern = /(?:AC|Acceptance)[:\s]*([\s\S]*?)(?=\n\s*#+|\n\s*---|\n\s*Priority|\n\s*Tags|$)/is;
        const match = block.match(acPattern);

        if (!match) {
            return [];
        }

        const items = match[1]
            .split(/\n(?=\*|\d+[.)])/)
            .filter((item) => item.trim().length > 0);

        items.forEach((item, index) => {
            const cleaned = item.replace(/^[\*\d+.)]+\s*/, '').trim();
            if (cleaned) {
                criteria.push({
                    id: `ac-${index + 1}`,
                    statement: cleaned,
                    scenario: [],
                });
            }
        });

        return criteria;
    }

    /**
     * Extract metadata (priority, tags, complexity) from a story block.
     */
    private extractMetadata(block: string): StoryMetadata {
        const metadata: Partial<StoryMetadata> = {
            priority: 'medium',
            tags: [],
            estimatedComplexity: 'moderate',
            domain: '',
        };

        // Priority
        const priorityMatch = block.match(/(?:Priority|PRIORITY)[:\s]*(critical|high|medium|low)/i);
        if (priorityMatch) {
            metadata.priority = priorityMatch[1].toLowerCase() as StoryMetadata['priority'];
        }

        // Tags
        const tagsMatch = block.match(/(?:Tags|TAGS)[:\s]*([^\n]+)/i);
        if (tagsMatch) {
            metadata.tags = tagsMatch[1]
                .split(/[,\s]+/)
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
        }

        // Complexity
        const complexityMatch = block.match(
            /(?:Complexity|EFFORT|SIZE)[:\s]*(simple|moderate|complex|trivial|large)/i,
        );
        if (complexityMatch) {
            const value = complexityMatch[1].toLowerCase();
            if (value === 'trivial' || value === 'simple') {
                metadata.estimatedComplexity = 'simple';
            } else if (value === 'large' || value === 'complex') {
                metadata.estimatedComplexity = 'complex';
            } else {
                metadata.estimatedComplexity = 'moderate';
            }
        }

        // Domain (extract from headers)
        const domainMatch = block.match(/^(?:Feature|Domain|Module|Subsystem)[:\s]+([^\n]+)/i);
        if (domainMatch) {
            metadata.domain = domainMatch[1].trim();
        }

        return metadata as StoryMetadata;
    }

    /**
     * Parse Jira ticket format.
     * Example: Summary: ... | Description: ... | Acceptance Criteria: ...
     */
    private parseJira(input: string): UserStory[] {
        const stories: UserStory[] = [];
        const summaryMatch = input.match(/Summary[:\s]+([^\n]+)/i);
        const descMatch = input.match(/Description[:\s]+([\s\S]*?)(?=\n\s*Acceptance|\n\s*Priority|$)/i);
        const acMatch = input.match(
            /Acceptance\s+Criteria[:\s]*([\s\S]*?)(?=\n\s*Priority|\n---|$)/i,
        );

        const title = summaryMatch?.[1]?.trim() || 'Jira Ticket';
        const description = descMatch?.[1]?.trim() || '';
        const { actor, action, purpose } = this.parseUserStoryStructure(description);

        const acceptanceCriteria = acMatch
            ? this.extractAcceptanceCriteria(acMatch[0])
            : [];

        const metadata = this.extractMetadata(input);

        this.storyCounter++;

        stories.push({
            id: `story-${this.storyCounter}`,
            title,
            description,
            actor,
            action,
            purpose,
            acceptanceCriteria,
            metadata,
        });

        return stories;
    }

    /**
     * Parse Linear ticket format (similar to Jira but with issue-specific conventions).
     */
    private parseLinear(input: string): UserStory[] {
        // Linear tickets are similar to Jira but often use different field names
        return this.parseJira(input);
    }

    /**
     * Parse plain text user stories.
     * Handles both "As a ... I want ... So that ..." and free-form descriptions.
     */
    private parsePlainText(input: string): UserStory[] {
        const stories: UserStory[] = [];

        // Try to find "As a" pattern
        const asAMatch = input.match(
            /As\s+a\s+[^.]+(?:\.[^.]+)*\.\s*(?:I\s+want(?:\s+to)?[^.]+(?:\.[^.]+)*\.\s*(?:So\s+that[^.]+(?:\.[^.]+)*)?\.)?/gis,
        );

        if (asAMatch && asAMatch.length > 0) {
            for (const storyText of asAMatch) {
                const { actor, action, purpose } = this.parseUserStoryStructure(storyText);

                this.storyCounter++;
                stories.push({
                    id: `story-${this.storyCounter}`,
                    title: action.substring(0, 80) || 'Untitled Story',
                    description: storyText,
                    actor,
                    action,
                    purpose,
                    acceptanceCriteria: [],
                    metadata: {
                        priority: 'medium',
                        tags: [],
                        estimatedComplexity: 'moderate',
                        domain: '',
                    },
                });
            }
        } else {
            // Treat entire input as a single story description
            this.storyCounter++;
            stories.push({
                id: `story-${this.storyCounter}`,
                title: input.substring(0, 80),
                description: input,
                actor: 'user',
                action: input.substring(0, 100),
                purpose: '',
                acceptanceCriteria: [],
                metadata: {
                    priority: 'medium',
                    tags: [],
                    estimatedComplexity: 'moderate',
                    domain: '',
                },
            });
        }

        return stories;
    }

    /**
     * Detect whether input is in Markdown format.
     */
    private isMarkdownFormat(input: string): boolean {
        return (
            input.includes('##') ||
            input.includes('###') ||
            input.includes('---') ||
            input.includes('**')
        );
    }

    /**
     * Detect whether input is in Jira format.
     */
    private isJiraFormat(input: string): boolean {
        const jiraFields = ['Summary', 'Description', 'Status', 'Priority', 'Labels', 'Component'];
        return jiraFields.some(
            (field) => new RegExp(`^${field}[:\\s]`, 'im').test(input),
        );
    }

    /**
     * Detect whether input is in Linear format.
     */
    private isLinearFormat(input: string): boolean {
        const linearFields = ['Title', 'Description', 'Type', 'Priority', 'Labels', 'Team'];
        return linearFields.some(
            (field) => new RegExp(`^${field}[:\\s]`, 'im').test(input),
        );
    }
}