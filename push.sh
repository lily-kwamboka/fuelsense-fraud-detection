#!/bin/bash
echo "Pushing to Lily-kwamboka (shared repo)..."
git push origin main

echo "Pushing to Wakash3 (Vercel fork)..."
git push https://github.com/Wakash3/FuelSense-Fraud-Detection.git main

echo "Done! Both repos updated."