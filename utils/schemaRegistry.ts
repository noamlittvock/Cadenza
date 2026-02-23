import { CategorySchema } from '../types';

export const CATEGORY_SCHEMAS: Record<string, CategorySchema> = {
    'individual_lesson': {
        id: 'individual_lesson',
        name: 'Individual Lesson',
        hasSubtypes: true,
        fields: [
            { id: 'studentName', label: 'Student Name', type: 'text', required: true },
            { id: 'lessonLevel', label: 'Level', type: 'select', options: ['Beginner', 'Intermediate', 'Advanced'] }
        ]
    },
    'group_lesson': {
        id: 'group_lesson',
        name: 'Group Lesson',
        fields: [
            { id: 'groupName', label: 'Group Name', type: 'text', required: true },
            { id: 'participantCount', label: 'Participant Count', type: 'number' }
        ]
    },
    'rehearsal': {
        id: 'rehearsal',
        name: 'Rehearsal',
        fields: [
            { id: 'ensembleName', label: 'Ensemble Name', type: 'text', required: true },
            { id: 'pieces', label: 'Pieces Rehearsed', type: 'text' }
        ]
    },
    'admin': {
        id: 'admin',
        name: 'Administrative',
        fields: [
            { id: 'taskDescription', label: 'Task Description', type: 'text', required: true }
        ]
    }
};
