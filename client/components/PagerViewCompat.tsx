import React, { forwardRef } from "react";
import PagerView from "react-native-pager-view";
import { StyleSheet, ViewStyle } from "react-native";

interface PagerViewCompatProps {
  style?: ViewStyle;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  children: React.ReactNode;
}

const PagerViewCompat = forwardRef<any, PagerViewCompatProps>(
  ({ style, initialPage = 0, onPageSelected, children }, ref) => {
    return (
      <PagerView
        ref={ref}
        style={[styles.pager, style]}
        initialPage={initialPage}
        onPageSelected={onPageSelected}
      >
        {children}
      </PagerView>
    );
  }
);

PagerViewCompat.displayName = "PagerViewCompat";

export default PagerViewCompat;

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
});
