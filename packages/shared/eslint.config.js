import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsparser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-native', 'react-native/*', 'expo-*', 'react', 'react-dom'],
              message:
                'packages/shared must stay platform-free — it is consumed by mobile (iOS+Android), the admin web panel, and Node scripts. Keep RN/DOM imports out.',
            },
          ],
        },
      ],
    },
  },
];
