import React from 'react';
import { useRoute } from '@react-navigation/native';
import { EmptyState } from '../components/StateViews';
import { Screen } from '../components/Screen';

export function PlaceholderScreen() {
  const route = useRoute();
  return (
    <Screen title={route.name}>
      <EmptyState
        icon="lab"
        title="Coming in the next phase"
        message="This screen is part of the navigation shell and will be built next."
      />
    </Screen>
  );
}
