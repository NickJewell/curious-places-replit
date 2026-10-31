import React, { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { ScrollView, View, StyleSheet, ViewStyle, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PagerViewCompatProps {
  style?: ViewStyle;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  children: React.ReactNode;
}

const PagerViewCompat = forwardRef<any, PagerViewCompatProps>(
  ({ style, initialPage = 0, onPageSelected, children }, ref) => {
    const scrollRef = useRef<ScrollView>(null);
    const pages = React.Children.toArray(children);

    useImperativeHandle(ref, () => ({
      setPage: (index: number) => {
        scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
      },
    }));

    const handleScroll = useCallback(
      (e: any) => {
        const offset = e.nativeEvent.contentOffset.x;
        const page = Math.round(offset / SCREEN_WIDTH);
        onPageSelected?.({ nativeEvent: { position: page } });
      },
      [onPageSelected]
    );

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        contentOffset={{ x: initialPage * SCREEN_WIDTH, y: 0 }}
        style={[styles.scroll, style]}
        scrollEventThrottle={16}
      >
        {pages.map((page, i) => (
          <View key={i} style={styles.page}>
            {page}
          </View>
        ))}
      </ScrollView>
    );
  }
);

PagerViewCompat.displayName = "PagerViewCompat";

export default PagerViewCompat;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});
