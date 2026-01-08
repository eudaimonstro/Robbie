// Jest setup file for React Native testing
// Note: @testing-library/react-native v12.4+ includes built-in Jest matchers

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }) => children,
  Stack: {
    Screen: () => null,
  },
  Tabs: {
    Screen: () => null,
  },
}));

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  })),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      apiUrl: 'http://localhost:3001',
    },
  },
}));

// Mock @react-native-picker/picker
jest.mock('@react-native-picker/picker', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  const Picker = ({ children, selectedValue, onValueChange, ...props }) => {
    return React.createElement(View, { testID: 'picker', ...props }, children);
  };

  Picker.Item = ({ label, value }) => {
    return React.createElement(Text, { testID: `picker-item-${value}` }, label);
  };

  return { Picker };
});

// Silence console warnings during tests (optional - comment out for debugging)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('Please update the following components')
  ) {
    return;
  }
  originalWarn.call(console, ...args);
};

// Mock timers for animations
jest.useFakeTimers();
