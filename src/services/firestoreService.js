// Firestore Service
// CRUD operations for project configurations stored in Firestore

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

const PROJECTS_COLLECTION = "projects";

export const FirestoreService = {
  // Get all projects from Firestore
  getAllProjects: async () => {
    try {
      const projectsCol = collection(db, PROJECTS_COLLECTION);
      const projectSnapshot = await getDocs(projectsCol);
      const projects = projectSnapshot.docs.map((doc) => ({
        ...doc.data(),
        firestoreId: doc.id,
      }));
      console.log(`📦 Loaded ${projects.length} projects from Firestore`);
      return projects;
    } catch (error) {
      console.error("Error getting projects from Firestore:", error);
      throw error;
    }
  },

  // Get a single project by ID
  getProject: async (projectId) => {
    try {
      const projectDoc = doc(db, PROJECTS_COLLECTION, projectId);
      const projectSnapshot = await getDoc(projectDoc);

      if (projectSnapshot.exists()) {
        return {
          ...projectSnapshot.data(),
          firestoreId: projectSnapshot.id,
        };
      } else {
        console.log(`Project ${projectId} not found in Firestore`);
        return null;
      }
    } catch (error) {
      console.error(`Error getting project ${projectId}:`, error);
      throw error;
    }
  },

  // Save a single project to Firestore
  saveProject: async (project) => {
    try {
      const projectId = project.id;
      const projectDoc = doc(db, PROJECTS_COLLECTION, projectId);

      const projectData = {
        ...project,
        lastUpdated: serverTimestamp(),
        lastScanned: serverTimestamp(),
      };

      await setDoc(projectDoc, projectData); // Replace entire document, don't merge
      console.log(`💾 Saved project ${projectId} to Firestore`);
      return { success: true, projectId };
    } catch (error) {
      console.error(`Error saving project ${project.id}:`, error);
      throw error;
    }
  },

  // Save multiple projects in a batch (more efficient for rescan)
  saveProjects: async (projects) => {
    try {
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();

      projects.forEach((project) => {
        const projectId = project.id;
        const projectDoc = doc(db, PROJECTS_COLLECTION, projectId);

        const projectData = {
          ...project,
          lastUpdated: timestamp,
          lastScanned: timestamp,
        };

        batch.set(projectDoc, projectData); // Replace entire document, don't merge
      });

      await batch.commit();
      console.log(`💾 Saved ${projects.length} projects to Firestore (batch)`);
      return { success: true, count: projects.length };
    } catch (error) {
      console.error("Error saving projects batch:", error);
      throw error;
    }
  },

  // Update a project (partial update)
  updateProject: async (projectId, updates) => {
    try {
      const projectDoc = doc(db, PROJECTS_COLLECTION, projectId);

      const updateData = {
        ...updates,
        lastUpdated: serverTimestamp(),
      };

      await updateDoc(projectDoc, updateData);
      console.log(`✏️ Updated project ${projectId} in Firestore`);
      return { success: true, projectId };
    } catch (error) {
      console.error(`Error updating project ${projectId}:`, error);
      throw error;
    }
  },

  // Delete a project
  deleteProject: async (projectId) => {
    try {
      const projectDoc = doc(db, PROJECTS_COLLECTION, projectId);
      await deleteDoc(projectDoc);
      console.log(`🗑️ Deleted project ${projectId} from Firestore`);
      return { success: true, projectId };
    } catch (error) {
      console.error(`Error deleting project ${projectId}:`, error);
      throw error;
    }
  },

  // Delete all projects (useful for cleanup)
  deleteAllProjects: async () => {
    try {
      const projectsCol = collection(db, PROJECTS_COLLECTION);
      const projectSnapshot = await getDocs(projectsCol);

      const batch = writeBatch(db);
      projectSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`🗑️ Deleted all projects from Firestore`);
      return { success: true, count: projectSnapshot.docs.length };
    } catch (error) {
      console.error("Error deleting all projects:", error);
      throw error;
    }
  },

  // Check if Firestore has any projects
  hasProjects: async () => {
    try {
      const projectsCol = collection(db, PROJECTS_COLLECTION);
      const projectSnapshot = await getDocs(projectsCol);
      return projectSnapshot.docs.length > 0;
    } catch (error) {
      console.error("Error checking if Firestore has projects:", error);
      return false;
    }
  },
};

export default FirestoreService;

