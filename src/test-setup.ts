import { MotionGlobalConfig } from 'motion/react';

// Nos testes as animações terminam na hora: o happy-dom não implementa bem
// o cancelamento de animações nativas e o resultado final é o que importa.
MotionGlobalConfig.skipAnimations = true;
