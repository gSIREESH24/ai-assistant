const CloudMessage = ({ text }) => {
  return (
    <div style={styles.cloud}>
      <div style={styles.cloudScroll}>
        {text}
      </div>
    </div>
  );
};
