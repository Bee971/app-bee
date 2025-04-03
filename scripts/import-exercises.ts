import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Database } from '../types/supabase';

// Charger les variables d'environnement
dotenv.config();

const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

// Types pour l'API WGER
type WgerExercise = {
  id: number;
  name: string;
  description: string;
  category: {
    id: number;
    name: string;
  };
  muscles: Array<{
    id: number;
    name: string;
    is_front: boolean;
  }>;
  equipment: Array<{
    id: number;
    name: string;
  }>;
  language: {
    id: number;
    short_name: string;
  };
};

// Mapping des catégories WGER vers nos catégories
const categoryMapping: Record<number, 'strength' | 'cardio' | 'flexibility' | 'bodyweight'> = {
  8: 'strength',    // Arms
  9: 'strength',    // Legs
  10: 'strength',   // Abs
  11: 'strength',   // Chest
  12: 'strength',   // Back
  13: 'strength',   // Shoulders
  14: 'cardio',     // Calves
  15: 'flexibility' // Stretching
};

// Mapping des muscles WGER vers nos groupes musculaires
const muscleMapping: Record<number, 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'abs' | 'full_body'> = {
  1: 'biceps',
  2: 'triceps',
  4: 'chest',
  5: 'back',
  6: 'abs',
  7: 'legs',
  8: 'legs',
  9: 'shoulders',
  10: 'chest',
  11: 'back',
  12: 'shoulders',
  13: 'biceps',
  14: 'triceps',
  15: 'abs'
};

// Mapping des équipements WGER vers nos types d'équipement
const equipmentMapping: Record<number, 'none' | 'dumbbells' | 'barbell' | 'kettlebell' | 'resistance_bands' | 'machine' | 'bodyweight'> = {
  1: 'barbell',
  2: 'machine',
  3: 'dumbbells',
  4: 'bodyweight',
  5: 'none',
  6: 'resistance_bands',
  7: 'kettlebell'
};

// Traductions des noms d'exercices
const exerciseTranslations: Record<string, string> = {
  'Bench Press': 'Développé couché',
  'Squat': 'Squat',
  'Deadlift': 'Soulevé de terre',
  'Pull-up': 'Traction',
  'Push-up': 'Pompe',
  'Dips': 'Dips',
  'Shoulder Press': 'Développé épaules',
  'Bicep Curl': 'Curl biceps',
  'Tricep Extension': 'Extension triceps',
  'Plank': 'Planche',
  'Crunch': 'Crunch',
  'Lunge': 'Fente',
  // Ajouter d'autres traductions au besoin
};

async function fetchExercisesFromWGER(): Promise<WgerExercise[]> {
  try {
    const response = await fetch('https://wger.de/api/v2/exercise/?language=2&limit=200');
    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error('Erreur lors de la récupération des exercices depuis WGER:', error);
    throw error;
  }
}

function translateExerciseName(name: string): string {
  return exerciseTranslations[name] || name;
}

function determineCategory(wgerExercise: WgerExercise): 'strength' | 'cardio' | 'flexibility' | 'bodyweight' {
  const category = categoryMapping[wgerExercise.category.id];
  if (!category) {
    // Par défaut, on considère que c'est un exercice de force
    return 'strength';
  }
  return category;
}

function determineMuscleGroup(wgerExercise: WgerExercise): 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'abs' | 'full_body' {
  if (wgerExercise.muscles.length === 0) {
    return 'full_body';
  }
  
  const primaryMuscle = wgerExercise.muscles[0];
  return muscleMapping[primaryMuscle.id] || 'full_body';
}

function determineEquipment(wgerExercise: WgerExercise): 'none' | 'dumbbells' | 'barbell' | 'kettlebell' | 'resistance_bands' | 'machine' | 'bodyweight' {
  if (wgerExercise.equipment.length === 0) {
    return 'bodyweight';
  }
  
  const primaryEquipment = wgerExercise.equipment[0];
  return equipmentMapping[primaryEquipment.id] || 'none';
}

async function importExercises() {
  try {
    console.log('Début de l\'importation des exercices...');
    
    // Récupérer les exercices depuis WGER
    const wgerExercises = await fetchExercisesFromWGER();
    console.log(`${wgerExercises.length} exercices récupérés depuis WGER`);

    // Transformer les exercices
    const transformedExercises = wgerExercises
      .filter(exercise => exercise.language.short_name === 'en')
      .map(exercise => ({
        name: translateExerciseName(exercise.name),
        description: exercise.description,
        category: determineCategory(exercise),
        muscle_group: determineMuscleGroup(exercise),
        equipment: determineEquipment(exercise)
      }));

    // Insérer les exercices dans Supabase
    for (const exercise of transformedExercises) {
      // Vérifier si l'exercice existe déjà
      const { data: existingExercise } = await supabase
        .from('exercises')
        .select('id')
        .eq('name', exercise.name)
        .single();

      if (existingExercise) {
        // Mettre à jour l'exercice existant
        const { error: updateError } = await supabase
          .from('exercises')
          .update(exercise)
          .eq('id', existingExercise.id);

        if (updateError) {
          console.error(`Erreur lors de la mise à jour de l'exercice ${exercise.name}:`, updateError);
          continue;
        }
        console.log(`Exercice mis à jour: ${exercise.name}`);
      } else {
        // Insérer le nouvel exercice
        const { error: insertError } = await supabase
          .from('exercises')
          .insert([exercise]);

        if (insertError) {
          console.error(`Erreur lors de l'insertion de l'exercice ${exercise.name}:`, insertError);
          continue;
        }
        console.log(`Nouvel exercice ajouté: ${exercise.name}`);
      }
    }

    console.log('Importation terminée avec succès !');
  } catch (error) {
    console.error('Erreur lors de l\'importation:', error);
    throw error;
  }
}

// Exécuter l'importation
importExercises()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erreur fatale:', error);
    process.exit(1);
  });
