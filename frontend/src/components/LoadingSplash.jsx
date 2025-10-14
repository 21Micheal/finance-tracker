import { motion, AnimatePresence } from "framer-motion";

function LoadingSplash({ isVisible }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600 text-white"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <motion.div
            className="text-3xl font-bold mb-4"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            Finance Tracker
          </motion.div>
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-white" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoadingSplash;
